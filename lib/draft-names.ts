import { shopifyGraphQL } from "@/lib/shopify";

// Shopify 草稿訂單編號（#D22 等）：用於列表顯示未付款記錄的訂單編號。讀取失敗時回傳空 Map，不影響列表。
export async function draftOrderNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const valid = [...new Set(ids.filter((id): id is string => !!id && /^gid:\/\/shopify\/DraftOrder\/\d+$/.test(id)))];
  for (let i = 0; i < valid.length; i += 100) {
    try {
      const res = await shopifyGraphQL<{ nodes: ({ id: string; name: string } | null)[] }>(
        `query DraftNames($ids: [ID!]!) { nodes(ids: $ids) { ... on DraftOrder { id name } } }`,
        { ids: valid.slice(i, i + 100) }
      );
      for (const n of res.nodes) if (n?.id && n.name) names.set(n.id, n.name);
    } catch (e) {
      console.error("[draft_names]", e instanceof Error ? e.message : "unknown");
    }
  }
  return names;
}
