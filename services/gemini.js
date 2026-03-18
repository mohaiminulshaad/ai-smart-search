/**
 * Gemini AI Service
 * Handles interactions with Google's Gemini API
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Create a Gemini service instance
 * @param {string} apiKey - Gemini API key
 * @returns {Object} Gemini service with chat methods
 */
export function createGeminiService(apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  /**
   * Stream a conversation with Gemini
   * @param {Object} params - Conversation parameters
   * @param {Array} params.messages - Conversation history
   * @param {Array} params.tools - Available tools/functions
   * @param {string} params.systemInstruction - System prompt
   * @param {Object} streamHandlers - Event handlers
   * @param {Function} streamHandlers.onText - Handle text chunks
   * @param {Function} streamHandlers.onFunctionCall - Handle function calls
   * @returns {Promise<Object>} Final response
   */
  const streamConversation = async ({ messages, tools = [], systemInstruction }, streamHandlers) => {
    try {
      console.log('[Gemini] Starting conversation with', messages.length, 'messages and', tools.length, 'tools');
      
      // Initialize model with tools
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemInstruction,
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined
      });

      // Convert messages to Gemini format
      const history = convertMessagesToGeminiFormat(messages.slice(0, -1));
      const lastMessage = messages[messages.length - 1];

      console.log('[Gemini] Last message:', typeof lastMessage.content === 'string' ? lastMessage.content.substring(0, 50) : 'complex content');

      // Start chat session
      const chat = model.startChat({
        history: history
      });

      // Send message and stream response
      const result = await chat.sendMessageStream(lastMessage.content);

      let fullText = '';
      let functionCalls = [];

      // Process stream
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
          if (streamHandlers.onText) {
            streamHandlers.onText(chunkText);
          }
        }

        // Check for function calls - access as property not method
        const calls = chunk.functionCalls?.() || [];
        if (calls.length > 0) {
          console.log('[Gemini] Got function calls from chunk:', calls.length);
          functionCalls.push(...calls);
        }
      }

      // Get final response
      const response = await result.response;
      console.log('[Gemini] Final response - text length:', fullText.length, 'function calls:', functionCalls.length);

      // If we got function calls from the final response, use those
      if (!functionCalls.length && response.functionCalls?.()?.length > 0) {
        functionCalls = response.functionCalls();
        console.log('[Gemini] Got function calls from final response:', functionCalls.length);
      }

      // Handle function calls
      if (functionCalls.length > 0 && streamHandlers.onFunctionCall) {
        console.log('[Gemini] Processing', functionCalls.length, 'function calls');
        for (const functionCall of functionCalls) {
          await streamHandlers.onFunctionCall({
            name: functionCall.name,
            args: functionCall.args,
            id: `func_${Date.now()}`
          });
        }
      }

      return {
        text: fullText,
        functionCalls: functionCalls,
        stopReason: functionCalls.length > 0 ? 'function_call' : 'end_turn'
      };
    } catch (error) {
      console.error('[Gemini] Error in stream conversation:', error);
      throw error;
    }
  };

  /**
   * Send a message with function results
   * @param {Object} chat - Active chat session
   * @param {Array} functionResults - Results from function calls
   * @returns {Promise<Object>} Response
   */
  const sendFunctionResults = async (chat, functionResults) => {
    try {
      const result = await chat.sendMessageStream([
        {
          functionResponse: functionResults.map(fr => ({
            name: fr.name,
            response: fr.response
          }))
        }
      ]);

      let fullText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
        }
      }

      return {
        text: fullText,
        stopReason: 'end_turn'
      };
    } catch (error) {
      console.error('[Gemini] Error sending function results:', error);
      throw error;
    }
  };

  return {
    streamConversation,
    sendFunctionResults
  };
}

/**
 * Convert messages to Gemini format
 * @param {Array} messages - Messages in standard format
 * @returns {Array} Gemini-formatted messages
 */
function convertMessagesToGeminiFormat(messages) {
  return messages.map(msg => {
    // Handle different message formats
    if (typeof msg.content === 'string') {
      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      };
    } else if (Array.isArray(msg.content)) {
      // Handle complex content (tool results, etc.)
      const parts = msg.content.map(content => {
        if (content.type === 'text') {
          return { text: content.text };
        } else if (content.type === 'tool_result') {
          // Convert tool results to function responses
          return {
            functionResponse: {
              name: content.tool_use_id,
              response: content.content
            }
          };
        }
        return { text: JSON.stringify(content) };
      });

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: parts
      };
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: JSON.stringify(msg.content) }]
    };
  });
}

export default { createGeminiService };
