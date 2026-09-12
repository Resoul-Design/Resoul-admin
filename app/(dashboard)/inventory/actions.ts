"use server";

import { revalidatePath } from "next/cache";
import { shopifyGraphQL } from "@/lib/shopify";

type ActionResult = { ok: boolean; error?: string };

// 更新款式售價
export async function updateVariantPrice(
  productId: string,
  variantId: string,
  price: string
): Promise<ActionResult> {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return { ok: false, error: "售價無效" };

  const M = `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }`;
  try {
    const d = await shopifyGraphQL<{
      productVariantsBulkUpdate: { userErrors: { message: string }[] };
    }>(M, {
      productId,
      variants: [{ id: variantId, price: p.toFixed(2) }],
    });
    const errs = d.productVariantsBulkUpdate.userErrors;
    if (errs?.length) return { ok: false, error: errs.map((e) => e.message).join("；") };
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function primaryLocationId(): Promise<string> {
  const d = await shopifyGraphQL<{ locations: { nodes: { id: string }[] } }>(
    `{ locations(first: 1) { nodes { id } } }`
  );
  const id = d.locations.nodes[0]?.id;
  if (!id) throw new Error("找不到出貨地點（location）");
  return id;
}

// 設定庫存數量（available）
export async function updateVariantInventory(
  inventoryItemId: string,
  quantity: number
): Promise<ActionResult> {
  const q = Math.round(Number(quantity));
  if (!Number.isFinite(q)) return { ok: false, error: "庫存數量無效" };

  const M = `mutation ($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { reason }
      userErrors { field message }
    }
  }`;
  try {
    const locationId = await primaryLocationId();
    const d = await shopifyGraphQL<{
      inventorySetQuantities: { userErrors: { message: string }[] };
    }>(M, {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId, locationId, quantity: q }],
      },
    });
    const errs = d.inventorySetQuantities.userErrors;
    if (errs?.length) return { ok: false, error: errs.map((e) => e.message).join("；") };
    revalidatePath("/inventory");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
