/**
 * MCP Client for Shopify
 * Manages connections to Shopify's Model Context Protocol endpoints
 */

/**
 * Creates a new MCP Client instance
 * @param {string} shopDomain - The shop domain (e.g., myshop.myshopify.com)
 * @param {string} conversationId - ID for the current conversation
 * @param {string} customerAccessToken - Optional customer access token
 */
export class MCPClient {
  constructor(shopDomain, conversationId, customerAccessToken = null) {
    this.shopDomain = shopDomain;
    this.conversationId = conversationId;
    this.customerAccessToken = customerAccessToken;
    
    // MCP endpoints
    this.storefrontMcpEndpoint = `https://${shopDomain}/api/mcp`;
    const accountDomain = shopDomain.replace('.myshopify.com', '.account.myshopify.com');
    this.customerMcpEndpoint = `https://${accountDomain}/customer/api/mcp`;
    
    // Available tools
    this.tools = [];
    this.customerTools = [];
    this.storefrontTools = [];
  }

  /**
   * Connect to the storefront MCP server and retrieve available tools
   * @returns {Promise<Array>} Array of available storefront tools
   */
  async connectToStorefrontServer() {
    try {
      console.log(`[MCP] Connecting to storefront: ${this.storefrontMcpEndpoint}`);
      
      const response = await this._makeJsonRpcRequest(
        this.storefrontMcpEndpoint,
        'tools/list',
        {}
      );

      const toolsData = response.result?.tools || [];
      this.storefrontTools = this._formatTools(toolsData);
      this.tools = [...this.tools, ...this.storefrontTools];

      console.log(`[MCP] Connected to storefront with ${this.storefrontTools.length} tools`);
      return this.storefrontTools;
    } catch (error) {
      console.error('[MCP] Failed to connect to storefront:', error.message);
      throw error;
    }
  }

  /**
   * Connect to the customer MCP server and retrieve available tools
   * @returns {Promise<Array>} Array of available customer tools
   */
  async connectToCustomerServer() {
    try {
      console.log(`[MCP] Connecting to customer MCP: ${this.customerMcpEndpoint}`);
      
      const headers = this.customerAccessToken 
        ? { 'Authorization': `Bearer ${this.customerAccessToken}` }
        : {};

      const response = await this._makeJsonRpcRequest(
        this.customerMcpEndpoint,
        'tools/list',
        {},
        headers
      );

      const toolsData = response.result?.tools || [];
      this.customerTools = this._formatTools(toolsData);
      this.tools = [...this.tools, ...this.customerTools];

      console.log(`[MCP] Connected to customer MCP with ${this.customerTools.length} tools`);
      return this.customerTools;
    } catch (error) {
      console.error('[MCP] Failed to connect to customer MCP:', error.message);
      // Don't throw - customer tools are optional
      return [];
    }
  }

  /**
   * Call a tool by name
   * @param {string} toolName - Name of the tool to call
   * @param {Object} toolArgs - Arguments to pass to the tool
   * @returns {Promise<Object>} Result from the tool call
   */
  async callTool(toolName, toolArgs) {
    // Determine which server handles this tool
    if (this.storefrontTools.some(t => t.name === toolName)) {
      return this.callStorefrontTool(toolName, toolArgs);
    } else if (this.customerTools.some(t => t.name === toolName)) {
      return this.callCustomerTool(toolName, toolArgs);
    } else {
      throw new Error(`Tool ${toolName} not found`);
    }
  }

  /**
   * Call a storefront tool
   * @param {string} toolName - Tool name
   * @param {Object} toolArgs - Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async callStorefrontTool(toolName, toolArgs) {
    try {
      console.log(`[MCP] Calling storefront tool: ${toolName}`);
      
      const response = await this._makeJsonRpcRequest(
        this.storefrontMcpEndpoint,
        'tools/call',
        {
          name: toolName,
          arguments: toolArgs
        }
      );

      return response.result || response;
    } catch (error) {
      console.error(`[MCP] Error calling storefront tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Call a customer tool
   * @param {string} toolName - Tool name
   * @param {Object} toolArgs - Tool arguments
   * @returns {Promise<Object>} Tool result or auth error
   */
  async callCustomerTool(toolName, toolArgs) {
    try {
      console.log(`[MCP] Calling customer tool: ${toolName}`);
      
      const headers = this.customerAccessToken 
        ? { 'Authorization': `Bearer ${this.customerAccessToken}` }
        : {};

      const response = await this._makeJsonRpcRequest(
        this.customerMcpEndpoint,
        'tools/call',
        {
          name: toolName,
          arguments: toolArgs
        },
        headers
      );

      return response.result || response;
    } catch (error) {
      // Handle auth errors
      if (error.status === 401) {
        return {
          error: {
            type: 'auth_required',
            message: 'Authentication required. Please log in to access your customer data.'
          }
        };
      }
      
      console.error(`[MCP] Error calling customer tool ${toolName}:`, error);
      return {
        error: {
          type: 'internal_error',
          message: `Error calling tool: ${error.message}`
        }
      };
    }
  }

  /**
   * Make a JSON-RPC request
   * @private
   */
  async _makeJsonRpcRequest(endpoint, method, params, headers = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        id: 1,
        params: params
      })
    });

    if (!response.ok) {
      const error = new Error(`Request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  /**
   * Format tools data for Gemini
   * @private
   */
  _formatTools(toolsData) {
    return toolsData.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema || tool.input_schema
    }));
  }

  /**
   * Convert MCP tools to Gemini function declarations format
   * @returns {Array} Gemini-compatible function declarations
   */
  getGeminiFunctionDeclarations() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: this._cleanSchemaForGemini(tool.input_schema)
    }));
  }

  /**
   * Clean schema to remove fields not supported by Gemini
   * @private
   */
  _cleanSchemaForGemini(schema) {
    if (!schema) return schema;

    const cleaned = JSON.parse(JSON.stringify(schema)); // Deep clone

    // Recursively remove additionalProperties and other unsupported fields
    const cleanObject = (obj, isTopLevel = false) => {
      if (!obj || typeof obj !== 'object') return;

      // Remove unsupported fields
      delete obj.additionalProperties;
      delete obj.$schema;
      delete obj.definitions;
      
      // Remove 'required' from nested properties (only allowed at top level for OBJECT type)
      if (!isTopLevel && obj.type !== 'object') {
        delete obj.required;
      }

      // If this is a properties object, clean each property
      if (obj.properties) {
        for (const key in obj.properties) {
          // Remove 'required' from individual properties
          delete obj.properties[key].required;
          cleanObject(obj.properties[key], false);
        }
      }

      // Clean items for arrays
      if (obj.items) {
        cleanObject(obj.items, false);
      }

      // Clean other nested objects
      for (const key in obj) {
        if (key !== 'properties' && key !== 'items' && typeof obj[key] === 'object' && obj[key] !== null) {
          if (Array.isArray(obj[key])) {
            obj[key].forEach(item => cleanObject(item, false));
          } else {
            cleanObject(obj[key], false);
          }
        }
      }
    };

    cleanObject(cleaned, true);
    return cleaned;
  }
}

export default MCPClient;
