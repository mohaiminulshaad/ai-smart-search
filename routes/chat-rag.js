/**
 * RAG-powered Smart Search API Routes
 * Uses Qdrant vector store + shop-configured LLM key for AI-powered search responses.
 */
import express from 'express';
import { VectorStoreService } from '../services/vector-store.js';
import { getSmartSearchSettings, getApiKeyValue, getOrCreateChatSession, getChatHistory, saveChatMessage } from '../config/dashboard-db.js';

const router = express.Router();
const vectorStore = new VectorStoreService();

/**
 * Resolve the shop's active API key.
 * Returns { provider, key } or null if none configured.
 */
async function resolveShopKey(shopDomain) {
  const settings = await getSmartSearchSettings(shopDomain);
  if (!settings.activeApiKeyId) return null;
  return getApiKeyValue(shopDomain, settings.activeApiKeyId);
}

/**
 * Stream a response using the Gemini API directly (no LangChain needed).
 */
async function streamGemini(apiKey, systemPrompt, userMessage, sendSSE, history = []) {
  const contents = [];
  // Add conversation history for context
  for (const h of history.slice(-6)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (text) sendSSE({ type: 'chunk', chunk: text });
  return text;
}

/**
 * Stream a response using LangChain ChatOpenAI with conversation history.
 */
async function streamOpenAI(apiKey, systemPrompt, message, sendSSE, history = []) {
  const { ChatOpenAI: OpenAIChat } = await import('@langchain/openai');
  const { HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');

  const model = new OpenAIChat({
    openAIApiKey: apiKey,
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
    streaming: true,
  });

  const messages = [new SystemMessage(systemPrompt)];
  for (const h of history.slice(-6)) {
    if (h.role === 'user') messages.push(new HumanMessage(h.content));
    else messages.push(new AIMessage(h.content));
  }
  messages.push(new HumanMessage(message));

  const stream = await model.stream(messages);
  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.content) {
      fullText += chunk.content;
      sendSSE({ type: 'chunk', chunk: chunk.content });
    }
  }
  return fullText;
}

/**
 * POST /api/chat/rag - RAG-powered chat endpoint
 */
router.post('/chat/rag', async (req, res) => {
  const { message, filters = {}, session_id, customer_id, guest_name, guest_email } = req.body;
  const shopDomain = req.headers['x-shop-domain'];

  if (!message || !shopDomain) {
    return res.status(400).json({ error: 'Message and X-Shop-Domain header required' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendSSE = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Resolve the shop's settings and API key
    const shopSettings = await getSmartSearchSettings(shopDomain);
    const apiKeyData = await resolveShopKey(shopDomain);
    if (!apiKeyData) {
      sendSSE({ type: 'chunk', chunk: shopSettings.fallbackMessage || 'AI responses are not configured yet. Please ask the store owner to add and select an API key in the smart search settings.' });
      sendSSE({ type: 'message_complete' });
      return res.end();
    }

    // ── Session + conversation history ──────────────────────────────────────
    let session = null;
    let history = [];
    try {
      session = await getOrCreateChatSession(shopDomain, {
        sessionId: session_id || null,
        customerId: customer_id || null,
        guestName: guest_name || null,
        guestEmail: guest_email || null,
      });
      history = await getChatHistory(session.id, 6); // last 3 exchanges
      await saveChatMessage(session.id, 'user', message);
    } catch (e) {
      console.warn('[RAG] Session/history error (non-fatal):', e.message);
    }

    // Send session_id back so widget can persist it
    if (session?.id) {
      sendSSE({ type: 'session', session_id: session.id });
    }

    // Use brand name if set, but never expose raw shop domain as the brand
    const safeBrandName = shopSettings.brandName && !shopSettings.brandName.includes('myshopify.com')
      ? shopSettings.brandName
      : 'this store';
    const storeInfo = shopSettings.shopDescription ? `\nAbout the store: ${shopSettings.shopDescription}` : '';
    const brandContext = `You are ${shopSettings.name}, the AI assistant for ${safeBrandName}.${storeInfo}\nIMPORTANT: Never mention any store domain or URL like "${shopDomain}" in your responses.`;

    // ── Detect general / greeting messages ──────────────────────────────────
    const GENERAL_PATTERNS = [
      /^(hi+|hello+|hey+|hiya|howdy|sup|what'?s up|yo)\b/i,
      /^how are you/i,
      /^(good|great|nice|thanks|thank you|ty|np|no problem|ok|okay|sure|great|sounds good|cool|awesome|got it|perfect)/i,
      /^(who are you|what (can|do) you do|what are you|help me|can you help|what is this)/i,
      /^(bye|goodbye|see you|take care|cya)/i,
    ];
    const isGeneralMessage = GENERAL_PATTERNS.some(p => p.test(message.trim()));

    if (isGeneralMessage) {
      const greetingSystem = `${brandContext}\nRespond naturally and warmly to the customer's message.\nIf they ask about the store or brand, use the store info above.\nNEVER mention the store domain, store URL, or internal store name (e.g. "my-test-store", "myshopify.com").\nKeep it brief (1-2 sentences).`;

      let botReply;
      if (apiKeyData.provider === 'gemini') {
        botReply = await streamGemini(apiKeyData.key, greetingSystem, message, sendSSE, history);
      } else {
        botReply = await streamOpenAI(apiKeyData.key, greetingSystem, message, sendSSE, history);
      }
      if (session && botReply) {
        saveChatMessage(session.id, 'assistant', botReply).catch(e => console.warn('[RAG] Failed to save bot reply:', e.message));
      }
      sendSSE({ type: 'message_complete' });
      return res.end();
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Rewrite follow-up queries using conversation history ────────────────
    // If the message looks like a follow-up (short, contains pronouns/references),
    // use a quick LLM call to rewrite it into a standalone search query.
    let searchQuery = message;
    if (history.length > 0) {
      const followUpPattern = /\b(it|its|this|that|these|those|the price|the product|them|they|one|ones|same|more|another|other)\b/i;
      const isShortOrFollowUp = message.split(/\s+/).length <= 8 || followUpPattern.test(message);

      if (isShortOrFollowUp) {
        try {
          const recentHistory = history.slice(-4).map(h => `${h.role}: ${h.content}`).join('\n');
          const rewritePrompt = `Given this conversation:\n${recentHistory}\n\nThe user now says: "${message}"\n\nRewrite the user's message as a standalone product search query that includes the specific product name or details from the conversation context. Output ONLY the rewritten query, nothing else. If the message is already a clear standalone query, output it unchanged.`;

          if (apiKeyData.provider === 'gemini') {
            const rewriteRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeyData.key}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: rewritePrompt }] }],
                  generationConfig: { maxOutputTokens: 60, temperature: 0 },
                }),
              }
            );
            if (rewriteRes.ok) {
              const d = await rewriteRes.json();
              const rewritten = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (rewritten) searchQuery = rewritten;
            }
          } else {
            const { ChatOpenAI: OpenAIChat } = await import('@langchain/openai');
            const model = new OpenAIChat({ openAIApiKey: apiKeyData.key, modelName: 'gpt-4o-mini', temperature: 0, maxTokens: 60 });
            const { HumanMessage } = await import('@langchain/core/messages');
            const result = await model.invoke([new HumanMessage(rewritePrompt)]);
            if (result.content) searchQuery = result.content.trim();
          }
          console.log(`[RAG] Query rewritten: "${message}" → "${searchQuery}"`);
        } catch (e) {
          console.warn('[RAG] Query rewrite failed (using original):', e.message);
        }
      }
    }

    sendSSE({ type: 'status', message: 'Searching...' });

    // Search products AND knowledge base in parallel
    const [rawResults, kbResults] = await Promise.all([
      vectorStore.search(shopDomain, searchQuery, {
        limit: filters.limit || 5,
        filters: {
          availableOnly: filters.availableOnly,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          vendor: filters.vendor,
          productType: filters.productType,
          tag: filters.tag,
        },
      }),
      vectorStore.searchKB(shopDomain, searchQuery, 3, 0.35),
    ]);

    // Hard shop-domain assertion — defence-in-depth
    const searchResults = rawResults.filter(p => {
      if (p.shop_domain && p.shop_domain !== shopDomain) {
        console.error(`[RAG] ⛔ shop_domain leakage blocked: ${p.shop_domain} in request for ${shopDomain}`);
        return false;
      }
      return true;
    });

    // Build KB context if available
    const kbContext = kbResults.length > 0
      ? `\n\nStore FAQ / Knowledge Base:\n` + kbResults.map((kb, i) =>
          `Q${i + 1}: ${kb.question}\nA${i + 1}: ${kb.answer}`
        ).join('\n\n')
      : '';

    // Decide: is this primarily a KB question (FAQ/policy) or a product question?
    const topKBScore = kbResults[0]?.score ?? 0;
    const topProductScore = searchResults[0]?.score ?? 0;
    const isKBQuestion = topKBScore > 0.45 && (searchResults.length === 0 || topKBScore > topProductScore + 0.05);

    let context;
    let systemPrompt;

    // ── KB-only answer (FAQ, policies, store info) ────────────────────────
    if (isKBQuestion) {
      systemPrompt = `${brandContext}
${kbContext}

The customer is asking a question about the store (FAQ, policies, shipping, etc.).
Use the Knowledge Base Q&A above to answer accurately.

Instructions:
- Answer based on the knowledge base information provided
- Be warm and helpful
- If the KB answer is relevant, use it directly but rephrase naturally
- NEVER mention the store domain, store URL, or internal store name
- Keep it concise (1-3 sentences)
- Do NOT use ** or any markdown formatting`;

      sendSSE({ type: 'status', message: 'Generating response...' });

      let botReply;
      if (apiKeyData.provider === 'gemini') {
        botReply = await streamGemini(apiKeyData.key, systemPrompt, `Customer Question: ${message}`, sendSSE, history);
      } else {
        botReply = await streamOpenAI(apiKeyData.key, systemPrompt, `Customer Question: ${message}`, sendSSE, history);
      }
      if (session && botReply) {
        saveChatMessage(session.id, 'assistant', botReply).catch(e => console.warn('[RAG] Failed to save bot reply:', e.message));
      }
      sendSSE({ type: 'message_complete' });
      return res.end();
    }

    if (searchResults.length === 0) {
      // No product matches — check if KB had anything useful
      if (kbContext) {
        systemPrompt = `${brandContext}
${kbContext}

The customer asked a question. No matching products were found, but the knowledge base may help.

Instructions:
- If the knowledge base answers their question, use that information
- Otherwise politely let them know and offer to help with something else
- NEVER mention the store domain or internal store name
- Keep it concise (1-3 sentences)
- Do NOT use ** or any markdown formatting`;

      } else {
        const allProducts = await vectorStore.search(shopDomain, 'product', {
          limit: 20,
          minScore: 0.01,
        });

        const filteredProducts = allProducts.filter(p => {
          if (p.shop_domain && p.shop_domain !== shopDomain) {
            console.error(`[RAG] ⛔ shop_domain leakage blocked: ${p.shop_domain} in request for ${shopDomain}`);
            return false;
          }
          return true;
        });

        if (filteredProducts.length === 0) {
          sendSSE({ type: 'chunk', chunk: shopSettings.fallbackMessage || "I'm sorry, there are currently no products available in this store. Please check back later!" });
          sendSSE({ type: 'message_complete' });
          return res.end();
        }

        context = `The store does NOT carry the specific item the customer asked about.\n\nAvailable products in store:\n` +
          filteredProducts.map((result, index) => `Product ${index + 1}:
- Name: ${result.title}
- Price: $${result.price_min}${result.price_max !== result.price_min ? ` - $${result.price_max}` : ''}
- Brand: ${result.vendor || 'N/A'}
- Type: ${result.product_type || 'N/A'}
- Available: ${result.available ? 'Yes' : 'No'}`).join('\n\n');

        systemPrompt = `${brandContext}
The customer asked about something that is NOT in the store's inventory.

Store Inventory:
${context}

Instructions:
- Politely let the customer know the specific item they asked for is not available
- Briefly mention what the store DOES carry in plain text (no asterisks, no markdown)
- NEVER mention the store domain, store URL, or internal store name (e.g. "my-test-store", "myshopify.com") — just talk about products
- Be friendly and suggest they browse available items
- If there are products that could be a good alternative, suggest them naturally
- Keep your response concise (2-3 sentences max)
- Do NOT say "I couldn't find" — instead say the store doesn't carry that item
- Do NOT use ** or any markdown formatting`;
      }

    } else {
      sendSSE({ type: 'status', message: `Found ${searchResults.length} relevant products` });

      context = searchResults.map((result, index) => {
        return `Product ${index + 1}:
- Name: ${result.title}
- Price: $${result.price_min}${result.price_max !== result.price_min ? ` - $${result.price_max}` : ''}
- Brand: ${result.vendor || 'N/A'}
- Type: ${result.product_type || 'N/A'}
- Available: ${result.available ? 'Yes' : 'No'}
- Description: ${result.text.substring(0, 200)}...
- Relevance Score: ${(result.score * 100).toFixed(1)}%`;
      }).join('\n\n');

      systemPrompt = `${brandContext}
Use the following product information to answer the customer's question.

Product Information:
${context}
${kbContext}

Instructions:
- Be warm, enthusiastic, and conversational — like a knowledgeable friend helping them shop
- Focus on the PRODUCT itself — describe its features, benefits, ingredients, what makes it special
- NEVER mention the store domain, store URL, or internal store name (e.g. "my-test-store", "myshopify.com") — just talk about the products
- Naturally mention the price as part of your recommendation (e.g. "and it's only $29!")
- If a product is a great deal or bestseller, show genuine excitement
- If products are out of stock, empathize and suggest checking back soon
- Write product names in plain text (do NOT use ** asterisks or any markdown formatting)
- Keep it concise (2-4 sentences) but make every word count
- If there are related products in the results, naturally suggest them (e.g. "This pairs great with..." or "You might also love...")
- End with a gentle nudge like "Want to know more?" or "I can help you find the perfect match!" when appropriate
- If the Knowledge Base has relevant info for the question, incorporate it naturally
- If none of the products match well, politely say so and offer to help find something else`;
    }

    // Stream the response using the shop's configured provider
    sendSSE({ type: 'status', message: 'Generating response...' });

    let botReply;
    if (apiKeyData.provider === 'gemini') {
      botReply = await streamGemini(apiKeyData.key, systemPrompt, `Customer Question: ${message}`, sendSSE, history);
    } else {
      botReply = await streamOpenAI(apiKeyData.key, systemPrompt, `Customer Question: ${message}`, sendSSE, history);
    }
    if (session && botReply) {
      saveChatMessage(session.id, 'assistant', botReply).catch(e => console.warn('[RAG] Failed to save bot reply:', e.message));
    }

    // Send product cards — split into primary (strong matches) and similar (weaker matches)
    if (searchResults.length > 0) {
      const topScore = searchResults[0].score;
      const scoreThreshold = topScore * 0.75; // products below 75% of top score are "also recommended"

      const primaryResults = [];
      const weakerResults = [];
      for (const p of searchResults.slice(0, 5)) {
        if (p.score >= scoreThreshold && primaryResults.length < 3) {
          primaryResults.push(p);
        } else {
          weakerResults.push(p);
        }
      }

      const formatProduct = p => ({
        id: p.product_id,
        title: p.title,
        price: p.price_min,
        image: p.image_url,
        available: p.available,
        handle: p.handle || '',
      });

      sendSSE({
        type: 'products',
        products: primaryResults.map(p => ({ ...formatProduct(p), score: p.score })),
      });

      // Build the "You might also like" section:
      // Start with weaker search results, then fetch more via collection/type/vendor
      const primaryIds = primaryResults.map(p => p.product_id);
      const alsoLike = weakerResults.map(formatProduct);

      const topResult = searchResults[0];
      const topCollection = topResult.collection_titles?.[0];
      const topProductType = topResult.product_type;
      const topVendor = topResult.vendor;
      const excludeIds = searchResults.slice(0, 5).map(p => p.product_id);
      const needMore = Math.max(0, 4 - alsoLike.length);

      if (needMore > 0) {
        let fetched = [];

        if (topCollection) {
          fetched = await vectorStore.searchSimilar(shopDomain, message, topCollection, excludeIds, needMore);
        }
        if (fetched.length === 0 && topProductType) {
          fetched = await vectorStore.searchByField(shopDomain, message, 'product_type', topProductType, excludeIds, needMore);
        }
        if (fetched.length === 0 && topVendor) {
          fetched = await vectorStore.searchByField(shopDomain, message, 'vendor', topVendor, excludeIds, needMore);
        }

        alsoLike.push(...fetched.map(formatProduct));
      }

      if (alsoLike.length > 0) {
        sendSSE({
          type: 'similar_products',
          collection: topCollection || topProductType || (topVendor ? `More from ${topVendor}` : ''),
          products: alsoLike.slice(0, 4),
        });
      }
    }

    sendSSE({ type: 'message_complete' });
    res.end();

  } catch (error) {
    console.error('[RAG Chat] Error:', error);
    sendSSE({ type: 'error', error: error.message });
    res.end();
  }
});

/**
 * POST /api/search/products - Direct product search endpoint
 */
router.post('/search/products', async (req, res) => {
  const { query, filters = {}, limit = 10 } = req.body;
  const shopDomain = req.headers['x-shop-domain'];

  if (!query || !shopDomain) {
    return res.status(400).json({ error: 'Query and X-Shop-Domain header required' });
  }

  try {
    const results = await vectorStore.search(shopDomain, query, {
      limit,
      filters: {
        availableOnly: filters.availableOnly,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        vendor: filters.vendor,
        productType: filters.productType,
        tag: filters.tag,
      },
    });

    res.json({
      query,
      results: results.map(r => ({
        productId: r.product_id,
        title: r.title,
        vendor: r.vendor,
        productType: r.product_type,
        price: {
          min: r.price_min,
          max: r.price_max,
        },
        available: r.available,
        inventory: r.total_inventory,
        tags: r.tags,
        image: r.image_url,
        score: r.score,
        description: r.text.substring(0, 200),
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('[Search] Error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

/**
 * GET /api/rag/health - Check RAG system health
 */
router.get('/rag/health', async (req, res) => {
  try {
    const qdrantHealth = await vectorStore.healthCheck();
    const stats = await vectorStore.getStats();

    res.json({
      status: qdrantHealth ? 'healthy' : 'unhealthy',
      qdrant: {
        connected: qdrantHealth,
        collection: stats.collection,
        totalVectors: stats.totalVectors,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
