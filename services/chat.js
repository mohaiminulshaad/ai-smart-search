/**
 * Chat Service
 * Manages conversation state and message history
 */
import pool from '../config/database.js';

/**
 * Get or create a conversation
 * @param {string} shopDomain - Shop domain
 * @param {string} conversationId - Optional conversation ID
 * @returns {Promise<Object>} Conversation details
 */
export async function getOrCreateConversation(shopDomain, conversationId = null) {
  try {
    if (conversationId) {
      // Try to fetch existing conversation
      const result = await pool.query(
        'SELECT * FROM conversations WHERE id = $1 AND shop_domain = $2',
        [conversationId, shopDomain]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }
    }

    // Create new conversation
    const newId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(
      'INSERT INTO conversations (id, shop_domain, created_at) VALUES ($1, $2, NOW()) RETURNING *',
      [newId, shopDomain]
    );

    return result.rows[0];
  } catch (error) {
    console.error('[Chat] Error getting/creating conversation:', error);
    throw error;
  }
}

/**
 * Save a message to the database
 * @param {string} conversationId - Conversation ID
 * @param {string} role - Message role (user/assistant)
 * @param {string} content - Message content
 * @returns {Promise<Object>} Saved message
 */
export async function saveMessage(conversationId, role, content) {
  try {
    const result = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [conversationId, role, content]
    );

    return result.rows[0];
  } catch (error) {
    console.error('[Chat] Error saving message:', error);
    throw error;
  }
}

/**
 * Get conversation history
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Array>} Array of messages
 */
export async function getConversationHistory(conversationId) {
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    return result.rows.map(row => {
      let content;
      try {
        // Try to parse JSON content
        content = JSON.parse(row.content);
      } catch {
        // If not JSON, use as string
        content = row.content;
      }

      return {
        role: row.role,
        content: content
      };
    });
  } catch (error) {
    console.error('[Chat] Error getting conversation history:', error);
    throw error;
  }
}

/**
 * Store customer access token
 * @param {string} conversationId - Conversation ID
 * @param {string} accessToken - Customer access token
 * @returns {Promise<void>}
 */
export async function storeCustomerToken(conversationId, accessToken) {
  try {
    await pool.query(
      'INSERT INTO customer_tokens (conversation_id, access_token, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (conversation_id) DO UPDATE SET access_token = $2, updated_at = NOW()',
      [conversationId, accessToken]
    );
  } catch (error) {
    console.error('[Chat] Error storing customer token:', error);
    throw error;
  }
}

/**
 * Get customer access token
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<string|null>} Access token or null
 */
export async function getCustomerToken(conversationId) {
  try {
    const result = await pool.query(
      'SELECT access_token FROM customer_tokens WHERE conversation_id = $1',
      [conversationId]
    );

    return result.rows.length > 0 ? result.rows[0].access_token : null;
  } catch (error) {
    console.error('[Chat] Error getting customer token:', error);
    return null;
  }
}

export default {
  getOrCreateConversation,
  saveMessage,
  getConversationHistory,
  storeCustomerToken,
  getCustomerToken
};
