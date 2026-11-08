import { shopifyGraphQL } from "@/lib/shopify";

// 確認 Shopify 付款連結草稿仍然存在（已刪除的草稿不可再用其付款連結）。
// 回傳仍存在的草稿 ID；讀取 Shopify 失敗時回傳 null（呼叫方應視作「照常使用」）。
export async function aliveDrafts(ids: (string | null | undefined)[]): Promise<Set<string> | null> {
  const list = [...new Set(ids.filter((id): id is string => !!id && id.startsWith("gid://shopify/DraftOrder/")))];
  const alive = new Set<string>();
  if (!list.length) return alive;
  try {
    for (let i = 0; i < list.length; i += 100) {
      const res = await shopifyGraphQL<{ nodes: ({ id: string; status: string } | null)[] }>(
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on DraftOrder { id status } } }`,
        { ids: list.slice(i, i + 100) }
      );
      for (const n of res.nodes) if (n?.id && n.status !== "COMPLETED") alive.add(n.id);
    }
    return alive;
  } catch {
    return null;
  }
}

// 單一草稿是否仍可用（未付款、未刪除）；讀取失敗時視作可用
export async function draftUsable(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const alive = await aliveDrafts([id]);
  return alive === null || alive.has(id);
}
