/**
 * middleware/session.js
 * Verifies Shopify App Bridge session tokens (JWT signed with SHOPIFY_API_SECRET).
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing session token' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 10,
    });
    req.shopifySession = payload;
    next();
  } catch (err) {
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
  const dest = req.shopifySession?.dest;
  if (dest) return dest.replace('https://', '');
  return req.query.shop || '';
}
