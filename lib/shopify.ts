import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// OAuth 要求的權限（與 dev dashboard app 設定一致）
export const SHOPIFY_SCOPES =
  "read_orders,read_products,write_products,read_inventory,read_content,read_customers";

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
  let token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!token && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await createAdminClient()
      .from("shopify_credentials")
      .select("access_token")
      .eq("id", "primary")
      .maybeSingle();
    token = data?.access_token;
  }
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

export type OrderLite = {
  createdAt: string;
  amount: number;
  currency: string;
  isCremation: boolean;
};

type OrdersPageResp = {
  orders: {
    edges: {
      cursor: string;
      node: {
        createdAt: string;
        cancelledAt: string | null;
        customAttributes: { key: string; value: string }[];
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      };
    }[];
    pageInfo: { hasNextPage: boolean };
  };
};

// 以游標分頁抓取指定日期起的所有訂單（避免 first:250 漏單）。
// includeCancelled=false 時略過已取消訂單。最多抓 maxPages 頁作安全上限。
export async function fetchOrdersSince(
  sinceDate: string,
  opts: { includeCancelled?: boolean; maxPages?: number } = {}
): Promise<OrderLite[]> {
  const maxPages = opts.maxPages ?? 40;
  const rows: OrderLite[] = [];
  let after: string | null = null;
  let pages = 0;
  const query = `query Orders($after: String) {
    orders(first: 250, after: $after, sortKey: CREATED_AT, query: "created_at:>=${sinceDate}") {
      edges { cursor node {
        createdAt cancelledAt
        customAttributes { key value }
        totalPriceSet { shopMoney { amount currencyCode } }
      } }
      pageInfo { hasNextPage }
    }
  }`;
  do {
    const d: OrdersPageResp = await shopifyGraphQL<OrdersPageResp>(query, { after });
    const edges = d.orders.edges;
    for (const e of edges) {
      if (!opts.includeCancelled && e.node.cancelledAt) continue;
      rows.push({
        createdAt: e.node.createdAt,
        amount: Number(e.node.totalPriceSet.shopMoney.amount),
        currency: e.node.totalPriceSet.shopMoney.currencyCode || "HKD",
        isCremation: (e.node.customAttributes || []).some((a) => a.key === "payment_ref" && a.value),
      });
    }
    after = d.orders.pageInfo.hasNextPage ? edges.at(-1)?.cursor || null : null;
    pages++;
  } while (after && pages < maxPages);
  return rows;
}
