import { cache } from "react";
import { shopDomain, shopifyGraphQL } from "@/lib/shopify";
import { canonicalProjectNo } from "@/lib/order-label";
import { phoneKey } from "@/lib/product-orders";

// 紀念品「＋ 新增訂單」建立、客人未付款的 Shopify 草稿訂單。
// product_orders 只有正式訂單；凡列出紀念品訂單的畫面須同時列出草稿（不計入收入）。
export type SouvenirDraft = {
  id: string;
  name: string;
  createdAt: string;
  invoiceUrl: string;
  adminUrl: string;
  amount: number;
  currency: string;
  owner: string;
  phone: string;
  phoneKey: string;
  projectNo: string; // 未有 RSL 專案編號時為空字串
  items: { title: string; quantity: number }[];
  itemsText: string;
};

type DraftsResponse = {
  draftOrders: {
    nodes: {
      id: string;
      name: string;
      createdAt: string;
      invoiceUrl: string | null;
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      customAttributes: { key: string; value: string | null }[];
      lineItems: { nodes: { title: string; quantity: number }[] };
    }[];
  };
};

const DRAFTS_QUERY = `{
  draftOrders(first: 100, sortKey: UPDATED_AT, reverse: true, query: "tag:'Memorial Product' AND -status:completed") {
    nodes {
      id name createdAt invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      customAttributes { key value }
      lineItems(first: 20) { nodes { title quantity } }
    }
  }
}`;

// 同一次請求內重用結果；讀取失敗時回傳空陣列，不影響頁面
export const loadSouvenirDrafts = cache(async (): Promise<SouvenirDraft[]> => {
  try {
    const res = await shopifyGraphQL<DraftsResponse>(DRAFTS_QUERY);
    const host = shopDomain().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return res.draftOrders.nodes.map((d) => {
      const attr = (k: string) => d.customAttributes.find((a) => a.key.toLowerCase() === k)?.value?.trim() || "";
      const no = canonicalProjectNo(attr("project no"));
      const items = d.lineItems.nodes;
      return {
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        invoiceUrl: d.invoiceUrl || "",
        adminUrl: `https://${host}/admin/draft_orders/${d.id.split("/").pop()}`,
        amount: Number(d.totalPriceSet.shopMoney.amount),
        currency: d.totalPriceSet.shopMoney.currencyCode,
        owner: attr("owner"),
        phone: attr("phone"),
        phoneKey: phoneKey(attr("phone")),
        projectNo: no === "—" ? "" : no,
        items,
        itemsText: items.map((it) => `${it.title}×${it.quantity}`).join("、"),
      };
    });
  } catch {
    return [];
  }
});
