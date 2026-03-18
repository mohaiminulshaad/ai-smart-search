/**
 * Simplified Chat API Routes
 * Uses our own product API instead of Shopify MCP
 */
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Function declarations for Gemini to use
 */
const tools = [
  {
    name: 'search_products',
    description: 'Search for products in the store catalog. Use this when customer asks about products, availability, prices, etc.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find products (e.g., "red shoes", "laptop")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_all_products',
    description: 'Get all products in the store. Use when customer asks "what do you sell" or wants to browse catalog.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * POST /api/chat/simple - Simple chat endpoint
 */
router.post('/chat/simple', async (req, res) => {
  const { message } = req.body;
  const shopDomain = req.headers['x-shop-domain'];

  if (!message || !shopDomain) {
    return res.status(400).json({ error: 'Message and X-Shop-Domain header required' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const sendSSE = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ functionDeclarations: tools }],
      systemInstruction: `You are a helpful store assistant. Answer questions about products, help customers find what they need, and provide information in a friendly way.

When listing products:
- Format as a bulleted list
- Include product name, price, and key features
- Use **bold** for product names
- Be concise but informative`
    });

    const chat = model.startChat({
      history: []
    });

    // Send initial message to Gemini
    const result = await chat.sendMessageStream(message);

    let fullResponse = '';
    let functionCalls = [];

    // Process stream
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponse += chunkText;
        sendSSE({ type: 'chunk', chunk: chunkText });
      }

      // Check for function calls
      const call = chunk.functionCalls();
      if (call && call.length > 0) {
        functionCalls.push(...call);
      }
    }

    // Handle function calls
    if (functionCalls.length > 0) {
      sendSSE({ type: 'message_complete' });
      sendSSE({ type: 'new_message' });

      for (const call of functionCalls) {
        sendSSE({ type: 'tool_use', tool_use_message: `Searching products...` });

        try {
          // Call our own product API
          const products = await getProducts(shopDomain, call.args.query);

          // Format products for Gemini
          let productsText = `Found ${products.length} products:\n\n`;
          products.forEach(p => {
            productsText += `- **${p.title}** - $${p.variants[0]?.price || 'N/A'}\n`;
            if (p.body_html) {
              const desc = p.body_html.replace(/<[^>]*>/g, '').substring(0, 100);
              productsText += `  ${desc}...\n`;
            }
            productsText += `\n`;
          });

          // Send function response back to Gemini
          const result2 = await chat.sendMessageStream([{
            functionResponse: {
              name: call.name,
              response: { products: productsText }
            }
          }]);

          // Stream Gemini's response about the products
          for await (const chunk of result2.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              sendSSE({ type: 'chunk', chunk: chunkText });
            }
          }

        } catch (error) {
          console.error('[Chat] Tool error:', error);
          sendSSE({ type: 'error', error: 'Failed to search products' });
        }
      }
    }

    sendSSE({ type: 'message_complete' });
    res.end();

  } catch (error) {
    console.error('[Chat] Error:', error);
    sendSSE({ type: 'error', error: error.message });
    res.end();
  }
});

/**
 * Helper: Get products from our API
 */
async function getProducts(shopDomain, query = null) {
  try {
    const response = await axios.get('http://localhost:3000/api/products', {
      headers: { 'X-Shop-Domain': shopDomain }
    });

    let products = response.data.products || [];

    // Filter by query if provided
    if (query) {
      const lowerQuery = query.toLowerCase();
      products = products.filter(p => 
        p.title.toLowerCase().includes(lowerQuery) ||
        (p.body_html && p.body_html.toLowerCase().includes(lowerQuery)) ||
        (p.tags && p.tags.toLowerCase().includes(lowerQuery))
      );
    }

    return products.slice(0, 10); // Limit to 10 results
  } catch (error) {
    console.error('[Chat] Error fetching products:', error.message);
    return [];
  }
}

export default router;
