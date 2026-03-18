/**
 * middleware/session.js
 * Verifies Shopify App Bridge session tokens (JWT signed with SHOPIFY_API_SECRET).
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export function verifySessionToken(req, res, next) {
  console.log('[verifySessionToken] Path:', req.path);
  const authHeader = req.headers.authorization || '';
  console.log('[verifySessionToken] Auth header:', authHeader);
  if (!authHeader.startsWith('Bearer ')) {
    console.log('[verifySessionToken] Missing token');
    return res.status(401).json({ detail: 'Missing session token' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 10,
    });
    console.log('[verifySessionToken] Payload:', payload);
    req.shopifySession = payload;
    next();
  } catch (err) {
    console.log('[verifySessionToken] Token error:', err.message);
    const msg = err.name === 'TokenExpiredError'
      ? 'Session token expired'
      : `Invalid session token: ${err.message}`;
    return res.status(401).json({ detail: msg });
  }
}

/**
 * Extract shop domain from the verified JWT payload.
 * App Bridge v4 sets payload.dest = "https://shop.myshopify.com"
 */
export function extractShop(req) {
  console.log('[extractShop] session:', req.shopifySession);
  const dest = req.shopifySession?.dest;
  console.log('[extractShop] dest:', dest);
  if (dest) return dest.replace('https://', '');
  const shop = req.query.shop || '';
  console.log('[extractShop] query shop:', shop);
  return shop;
}
