import crypto from "crypto";

// OAuth 要求的權限（與 dev dashboard app 設定一致）
export const SHOPIFY_SCOPES =
  "read_orders,read_products,read_inventory,read_content";

export function shopDomain(): string {
  return process.env.SHOPIFY_STORE_DOMAIN || "";
}

// 建立 Shopify 授權網址（使用者按下後會去 Shopify 同意畫面）
export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY || "",
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shopDomain()}/admin/oauth/authorize?${params.toString()}`;
}

// 用授權碼換取 offline access token（不會過期）
export async function exchangeToken(
  code: string
): Promise<{ access_token: string; scope: string }> {
  const res = await fetch(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token 交換失敗 (${res.status})：${await res.text()}`);
  }
  return res.json();
}

// 驗證 Shopify callback 的 HMAC 簽章（best-effort；本機一次性工具）
export function verifyHmac(searchParams: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hmac = searchParams.get("hmac") || "";
  if (!secret || !hmac) return false;

  const pairs: string[] = [];
  searchParams.forEach((value, key) => {
    if (key === "hmac" || key === "signature") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const digest = crypto
    .createHmac("sha256", secret)
    .update(pairs.join("&"))
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch {
    return false;
  }
}

// 之後模組用：呼叫 Admin GraphQL API
export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token) throw new Error("缺少 SHOPIFY_ADMIN_API_TOKEN（請先完成 OAuth 授權）");
  const res = await fetch(
    `https://${shopDomain()}/admin/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}
