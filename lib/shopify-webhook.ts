import crypto from "crypto";

function timingSafeEqualText(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyShopifyWebhook(rawBody: string, hmac: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET || "";
  if (!secret || !hmac) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return timingSafeEqualText(digest, hmac);
}

