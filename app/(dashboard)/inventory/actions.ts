"use server";

// 倉存 · 出貨：在後台修改售價及庫存，直接同步 Shopify（售價：productVariantsBulkUpdate；庫存：inventorySetQuantities）
import { revalidatePath, revalidateTag } from "next/cache";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { shopifyGraphQL } from "@/lib/shopify";

export type InventoryChange = {
  productId: string; variantId: string; label: string;
  price?: string; // 新售價
  qty?: number; fromQty?: number | null; inventoryItemId?: string | null; locationId?: string | null; // 新庫存及原有庫存（核對期間有否被改動）
};

const PRICE = `mutation SetPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`;
const QTY = `mutation SetQty($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) { userErrors { field message code } }
}`;

export async function saveInventory(changes: InventoryChange[]): Promise<{ error?: string; done?: string; failed?: string[] }> {
  await requireModule("inventory");
  if (!Array.isArray(changes) || !changes.length) return { error: "沒有修改。" };
  if (changes.length > 300) return { error: "一次最多 300 項。" };
  const failed: string[] = [];
  let prices = 0, stocks = 0;

  // 售價：按產品分組一次更新
  const byProduct = new Map<string, InventoryChange[]>();
  for (const c of changes) {
    if (c.price === undefined) continue;
    const n = Number(String(c.price).replace(/[$,\s]/g, ""));
    if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(c.variantId) || !Number.isFinite(n) || n < 0) { failed.push(`${c.label}：售價不正確`); continue; }
    byProduct.set(c.productId, [...(byProduct.get(c.productId) || []), { ...c, price: n.toFixed(2) }]);
  }
  for (const [productId, list] of byProduct) {
    try {
      const res = await shopifyGraphQL<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(PRICE, { productId, variants: list.map((c) => ({ id: c.variantId, price: c.price })) });
      const errs = res.productVariantsBulkUpdate.userErrors;
      if (errs.length) failed.push(`${list.map((c) => c.label).join("、")}：${errs.map((e) => e.message).join("；")}`);
      else prices += list.length;
    } catch (e) {
      failed.push(`${list.map((c) => c.label).join("、")}：${e instanceof Error ? e.message.slice(0, 120) : "未能更新售價"}`);
    }
  }

  // 庫存：設定「可售」數量；期間如在 Shopify 被改動則不覆蓋（changeFromQuantity）
  const stockChanges = changes.filter((c) => c.qty !== undefined);
  const valid = stockChanges.filter((c) => {
    if (!c.inventoryItemId || !c.locationId) { failed.push(`${c.label}：此款式沒有追蹤庫存，未能更新`); return false; }
    if (!Number.isInteger(c.qty) || (c.qty as number) < 0 || (c.qty as number) > 100000) { failed.push(`${c.label}：庫存須為 0 或以上的整數`); return false; }
    return true;
  });
  for (let i = 0; i < valid.length; i += 50) {
    const batch = valid.slice(i, i + 50);
    try {
      const res = await shopifyGraphQL<{ inventorySetQuantities: { userErrors: { message: string; code: string | null }[] } }>(QTY, {
        input: {
          name: "available", reason: "correction", referenceDocumentUri: "resoul://admin/inventory",
          quantities: batch.map((c) => ({ inventoryItemId: c.inventoryItemId, locationId: c.locationId, quantity: c.qty, changeFromQuantity: c.fromQty ?? null })),
        },
      });
      const errs = res.inventorySetQuantities.userErrors;
      if (errs.length) failed.push(`${batch.map((c) => c.label).join("、")}：${errs.some((e) => /COMPARE|CHANGE_FROM/i.test(e.code || "")) ? "庫存已在 Shopify 被更改，請重新整理後再改" : errs.map((e) => e.message).join("；")}`);
      else stocks += batch.length;
    } catch (e) {
      failed.push(`${batch.map((c) => c.label).join("、")}：${e instanceof Error ? e.message.slice(0, 120) : "未能更新庫存"}`);
    }
  }

  await logAudit("update_inventory", "shopify_products", null, `售價 ${prices} 項、庫存 ${stocks} 項${failed.length ? `、失敗 ${failed.length}` : ""}｜${changes.map((c) => `${c.label}${c.price !== undefined ? ` 售價 ${c.price}` : ""}${c.qty !== undefined ? ` 庫存 ${c.fromQty ?? "—"}→${c.qty}` : ""}`).join("；").slice(0, 900)}`);
  revalidateTag("shopify-catalog");
  revalidatePath("/inventory");
  return { done: `已同步 Shopify：售價 ${prices} 項、庫存 ${stocks} 項。`, ...(failed.length ? { failed } : {}) };
}
