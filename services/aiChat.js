/**
 * services/aiChat.js
 * AI response generation for the storefront smartSearch widget.
 * Supports Gemini, ChatGPT, and falls back to a stub response.
 */

function buildSystemPrompt(smartSearchName, toneOfVoice, { productContext = null, brandName = '', shopDescription = '' } = {}) {
  const tone = {
    professional: 'professional and concise',
    friendly: 'warm and friendly',
    casual: 'casual and conversational',
  }[toneOfVoice] || 'helpful';

  let prompt =
    `You are ${smartSearchName}, the AI assistant for ${brandName || 'a Shopify store'}. ` +
    `Your tone is ${tone}. `;

  if (shopDescription) {
    prompt += `About the store: ${shopDescription} `;
  }

  prompt +=
    `Help customers with product questions, recommendations, and store information. ` +
    `Keep responses concise and helpful. ` +
    `NEVER mention the store domain, store URL, or internal store name (e.g. "my-test-store", "myshopify.com") — just talk about products. ` +
    `If you don't know something, say so honestly.`;

  if (productContext) {
    prompt +=
      `\n\nThe customer sent an image. First briefly describe what you see in the image, ` +
      `including any visible text, brand names, or product names. ` +
      `Then recommend matching products from the store inventory below. ` +
      `Do NOT use ** asterisks or markdown formatting.\n\n` +
      `Store Products:\n${productContext}`;
  } else {
    prompt += ` If an image is provided, describe what you see and give relevant advice.`;
  }

  return prompt;
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(apiKey, message, systemPrompt, history = [], imageUrl = null, imageBuffer = null, imageMimeType = null) {
  const contents = [];

  for (const h of history.slice(-10)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }

  const parts = [];

  // Prefer raw buffer (works for guests too), fall back to URL fetch
  if (imageBuffer) {
    try {
      const base64   = Buffer.from(imageBuffer).toString('base64');
      const mimeType = imageMimeType || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data: base64 } });
    } catch (e) {
      console.warn('Could not encode image buffer for Gemini:', e.message);
    }
  } else if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      const imgBuf = await imgRes.arrayBuffer();
      const base64 = Buffer.from(imgBuf).toString('base64');
      const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data: base64 } });
    } catch (e) {
      console.warn('Could not fetch image for Gemini:', e.message);
    }
  }
  parts.push({ text: message });
  contents.push({ role: 'user', parts });

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
  return data.candidates?.[0]?.content?.parts?.[0]?.text ||
    'Sorry, I could not generate a response.';
}

// ── ChatGPT (OpenAI) ──────────────────────────────────────────────────────────
async function callChatGPT(apiKey, message, systemPrompt, history = [], imageUrl = null, imageBuffer = null, imageMimeType = null) {
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const h of history.slice(-10)) {
    messages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    });
  }

  // Build effective imageUrl: use data URI from buffer if no CDN URL available
  let effectiveImageUrl = imageUrl;
  if (!effectiveImageUrl && imageBuffer) {
    const base64   = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageMimeType || 'image/jpeg';
    effectiveImageUrl = `data:${mimeType};base64,${base64}`;
  }

  if (effectiveImageUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: effectiveImageUrl } },
        { type: 'text', text: message },
      ],
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: effectiveImageUrl ? 'gpt-4o' : 'gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
}

const NO_KEY_MSG = 'AI responses are not configured yet. Please ask the store owner to add and select an API key in the smart search settings.';

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Generate a response using the configured API key.
 */
export async function generateAIResponse({
  message,
  userType = 'guest',
  history = [],
  imageUrl = null,
  imageBuffer = null,
  imageMimeType = null,
  apiKeyData = null,
  smartSearchName = 'Shopify Smart Search',
  toneOfVoice = 'friendly',
  productContext = null,
  brandName = '',
  shopDescription = '',
}) {
  const systemPrompt = buildSystemPrompt(smartSearchName, toneOfVoice, { productContext, brandName, shopDescription });

  // Only use the merchant-configured API key — no hardcoded fallback.
  const provider = apiKeyData?.provider || null;
  const apiKey   = apiKeyData?.key || null;

  if (!apiKey) return NO_KEY_MSG;

  try {
    if (provider === 'gemini') {
      return await callGemini(apiKey, message, systemPrompt, history, imageUrl, imageBuffer, imageMimeType);
    }
    if (provider === 'chatgpt') {
      return await callChatGPT(apiKey, message, systemPrompt, history, imageUrl, imageBuffer, imageMimeType);
    }
    return NO_KEY_MSG;
  } catch (err) {
    console.error('  ❌  AI generation error:', err.message);
    return `I'm having trouble connecting to the AI service right now. Please try again in a moment.`;
  }
}
