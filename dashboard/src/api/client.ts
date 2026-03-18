/**
 * API Client — all requests go to the Express server.
 * Session token is fetched from Shopify App Bridge v4 on every request.
 */

const API_BASE = '/api';

async function getSessionToken(): Promise<string> {
  const shopify = (window as any).shopify;
  if (!shopify?.idToken) {
    throw new Error('App Bridge not available — app must run inside Shopify Admin');
  }
  return shopify.idToken();
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await getSessionToken();
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...headers,
    },
  };
  if (body) config.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const contentType = response.headers.get('content-type') || '';

  async function parseJsonSafe() {
    if (!contentType.includes('application/json')) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `Expected JSON from ${endpoint}, got ${contentType || 'unknown content type'}. ` +
        `Response starts with: ${bodyText.slice(0, 120)}`
      );
    }
    return response.json();
  }

  if (!response.ok) {
    const error = await parseJsonSafe().catch(() => ({ detail: `Request failed (${response.status})` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return parseJsonSafe();
}

export const api = {
  get:    <T>(endpoint: string)                => apiRequest<T>(endpoint),
  post:   <T>(endpoint: string, body: unknown) => apiRequest<T>(endpoint, { method: 'POST', body }),
  delete: <T>(endpoint: string)                => apiRequest<T>(endpoint, { method: 'DELETE' }),
};
