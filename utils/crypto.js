import Cryptr from 'cryptr';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const cryptr = new Cryptr(process.env.ENCRYPTION_KEY);

/**
 * Encrypt access token before storing in database
 */
export const encryptToken = (token) => {
  return cryptr.encrypt(token);
};

/**
 * Decrypt access token from database
 */
export const decryptToken = (encryptedToken) => {
  return cryptr.decrypt(encryptedToken);
};

/**
 * Verify HMAC signature from Shopify OAuth callback
 */
export const verifyHmac = (query) => {
  const { hmac, ...params } = query;
  
  if (!hmac) {
    return false;
  }

  // Build message string from sorted query params (excluding hmac)
  const message = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // Generate HMAC digest
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(digest)
    );
  } catch (error) {
    return false;
  }
};

/**
 * Generate random state nonce for CSRF protection
 */
export const generateNonce = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Validate Shopify shop domain format
 */
export const isValidShopDomain = (shop) => {
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  return shopRegex.test(shop);
};
