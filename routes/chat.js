/**
 * Chat API Routes
 * Handles chat interactions with Gemini and MCP tools
 */
import express from 'express';
import { MCPClient } from '../services/mcp-client.js';
import { createGeminiService } from '../services/gemini.js';
import { getSseHeaders, createStreamManager } from '../services/streaming.js';
import {
  getOrCreateConversation,
  saveMessage,
  getConversationHistory,
  getCustomerToken
} from '../services/chat.js';

const router = express.Router();

/**
 * System prompt for the smartSearch
 */
const SYSTEM_PROMPT = `You are a helpful store assistant for an e-commerce shop. Answer the customer's questions in a friendly, helpful way about products, shipping, returns, or anything else about the store.

Formatting guidelines:
1. When providing cart or checkout links, always format them like this: 'You can [click here to proceed to checkout](URL)' instead of showing the raw URL.
2. When creating lists, use proper Markdown formatting with bullet points or numbers.
3. Use **bold text** for emphasis on important points.
4. Be concise but informative.`;

/**
 * POST /api/chat - Handle chat messages
 * Supports Server-Sent Events (SSE) for streaming responses
 */
router.post('/chat', async (req, res) => {
  const { message, conversation_id } = req.body;
  const shopDomain = req.headers['x-shop-domain'];

  console.log('[Chat] Received request:', { message: message?.substring(0, 50), conversation_id, shopDomain });

  // Validate inputs
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!shopDomain) {
    return res.status(400).json({ error: 'X-Shop-Domain header is required' });
  }

  try {
    // Set SSE headers
    const origin = req.headers.origin || '*';
    res.writeHead(200, getSseHeaders(origin));

    console.log('[Chat] SSE headers set, creating stream manager');

    // Create stream manager
    const stream = createStreamManager(res);

    // Handle the chat session
    await handleChatSession({
      shopDomain,
      message,
      conversationId: conversation_id,
      stream,
      req
    });

  } catch (error) {
    console.error('[Chat] Error in chat endpoint:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    } else {
      const stream = createStreamManager(res);
      stream.handleStreamingError(error);
      stream.closeStream();
    }
  }
});

/**
 * GET /api/chat/history - Get conversation history
 */
router.get('/chat/history', async (req, res) => {
  const { conversation_id } = req.query;
  const shopDomain = req.headers['x-shop-domain'];

  if (!conversation_id) {
    return res.status(400).json({ error: 'conversation_id is required' });
  }

  if (!shopDomain) {
    return res.status(400).json({ error: 'X-Shop-Domain header is required' });
  }

  try {
    const messages = await getConversationHistory(conversation_id);
    res.json({ messages });
  } catch (error) {
    console.error('[Chat] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

/**
 * Handle a complete chat session
 */
async function handleChatSession({ shopDomain, message, conversationId, stream, req }) {
  try {
    console.log('[Chat] Starting chat session');
    
    // Initialize Gemini service
    const geminiService = createGeminiService();
    console.log('[Chat] Gemini service created');

    // Get or create conversation
    const conversation = await getOrCreateConversation(shopDomain, conversationId);
    const convId = conversation.id;
    console.log('[Chat] Conversation ID:', convId);

    // Send conversation ID to client
    stream.sendMessage({
      type: 'id',
      conversation_id: convId
    });

    // Initialize MCP client
    const customerToken = await getCustomerToken(convId);
    const mcpClient = new MCPClient(shopDomain, convId, customerToken);
    console.log('[Chat] MCP client created');

    // Connect to MCP servers
    let tools = [];
    try {
      await mcpClient.connectToStorefrontServer();
      await mcpClient.connectToCustomerServer();
      tools = mcpClient.getGeminiFunctionDeclarations();
      console.log(`[Chat] Connected to MCP with ${tools.length} tools`);
    } catch (error) {
      console.warn('[Chat] Failed to connect to MCP, continuing without tools:', error.message);
    }

    // Save user message
    await saveMessage(convId, 'user', message);

    // Get conversation history
    const history = await getConversationHistory(convId);

    // Track products to display
    let productsToDisplay = [];

    // Start conversation loop
    let continueConversation = true;
    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;

    while (continueConversation && iteration < maxIterations) {
      iteration++;

      // Stream conversation with Gemini
      const response = await geminiService.streamConversation(
        {
          messages: history,
          tools: tools,
          systemInstruction: SYSTEM_PROMPT
        },
        {
          // Handle text chunks
          onText: (textChunk) => {
            stream.sendMessage({
              type: 'chunk',
              chunk: textChunk
            });
          },

          // Handle function calls
          onFunctionCall: async (functionCall) => {
            const toolName = functionCall.name;
            const toolArgs = functionCall.args;

            stream.sendMessage({
              type: 'tool_use',
              tool_use_message: `Calling tool: ${toolName}`
            });

            console.log(`[Chat] Calling tool: ${toolName}`, toolArgs);

            try {
              // Call the MCP tool
              const toolResult = await mcpClient.callTool(toolName, toolArgs);

              // Check for errors
              if (toolResult.error) {
                if (toolResult.error.type === 'auth_required') {
                  stream.sendMessage({ type: 'auth_required' });
                  
                  // Add auth error to history
                  history.push({
                    role: 'assistant',
                    content: `I need your permission to access that information. Please log in.`
                  });
                } else {
                  console.error('[Chat] Tool error:', toolResult.error);
                  history.push({
                    role: 'assistant',
                    content: `I encountered an error: ${toolResult.error.message}`
                  });
                }
              } else {
                // Process successful tool result
                if (toolName === 'search_shop_catalog' && toolResult.content) {
                  // Extract products from search results
                  const products = extractProducts(toolResult);
                  productsToDisplay.push(...products);
                }

                // Add tool result to history
                history.push({
                  role: 'user',
                  content: JSON.stringify(toolResult)
                });

                // Save tool result
                await saveMessage(convId, 'user', JSON.stringify(toolResult));
              }
            } catch (error) {
              console.error('[Chat] Error calling tool:', error);
              stream.sendError({
                type: 'tool_error',
                error: 'Tool execution failed',
                details: error.message
              });
            }
          }
        }
      );

      // Save assistant response
      if (response.text) {
        await saveMessage(convId, 'assistant', response.text);
        history.push({
          role: 'assistant',
          content: response.text
        });
      }

      // Send message complete
      stream.sendMessage({ type: 'message_complete' });

      // Check if we should continue (if there were function calls)
      continueConversation = response.stopReason === 'function_call';

      if (continueConversation) {
        stream.sendMessage({ type: 'new_message' });
      }
    }

    // Send end turn
    stream.sendMessage({ type: 'end_turn' });

    // Send products if any
    if (productsToDisplay.length > 0) {
      stream.sendMessage({
        type: 'product_results',
        products: productsToDisplay.slice(0, 3) // Limit to 3 products
      });
    }

    // Close stream
    stream.closeStream();

  } catch (error) {
    console.error('[Chat] Error in chat session:', error);
    stream.handleStreamingError(error);
    stream.closeStream();
  }
}

/**
 * Extract products from tool result
 */
function extractProducts(toolResult) {
  try {
    if (!toolResult.content || toolResult.content.length === 0) {
      return [];
    }

    const content = toolResult.content[0].text;
    let data;

    if (typeof content === 'string') {
      data = JSON.parse(content);
    } else {
      data = content;
    }

    if (data?.products && Array.isArray(data.products)) {
      return data.products.map(product => ({
        id: product.product_id || product.id,
        title: product.title || 'Product',
        price: product.price_range
          ? `${product.price_range.currency} ${product.price_range.min}`
          : 'Price not available',
        image_url: product.image_url || '',
        description: product.description || '',
        url: product.url || ''
      }));
    }

    return [];
  } catch (error) {
    console.error('[Chat] Error extracting products:', error);
    return [];
  }
}

export default router;
