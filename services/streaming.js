/**
 * Streaming Service
 * Provides utilities for Server-Sent Events (SSE) streaming
 */

/**
 * Create SSE headers
 * @param {string} origin - Request origin
 * @returns {Object} SSE headers
 */
export function getSseHeaders(origin = '*') {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Create a stream manager for SSE
 * @param {Response} res - Express response object
 * @returns {Object} Stream manager with utility methods
 */
export function createStreamManager(res) {
  /**
   * Send a data message to the client
   * @param {Object} data - Data to send
   */
  const sendMessage = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('[Stream] Error sending message:', error);
    }
  };

  /**
   * Send an error message
   * @param {Object} error - Error details
   */
  const sendError = ({ type, error, details }) => {
    sendMessage({
      type: type || 'error',
      error: error,
      details: details
    });
  };

  /**
   * Close the stream
   */
  const closeStream = () => {
    try {
      res.end();
    } catch (error) {
      console.error('[Stream] Error closing stream:', error);
    }
  };

  /**
   * Handle streaming errors
   * @param {Error} error - The error that occurred
   */
  const handleStreamingError = (error) => {
    console.error('[Stream] Streaming error:', error);

    if (error.message?.includes('API_KEY') || error.message?.includes('auth')) {
      sendError({
        type: 'error',
        error: 'Authentication failed',
        details: 'Please check your Gemini API key'
      });
    } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
      sendError({
        type: 'rate_limit_exceeded',
        error: 'Rate limit exceeded',
        details: 'Please try again later'
      });
    } else {
      sendError({
        type: 'error',
        error: 'Failed to get response',
        details: error.message
      });
    }
  };

  return {
    sendMessage,
    sendError,
    closeStream,
    handleStreamingError
  };
}

export default { getSseHeaders, createStreamManager };
