"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain, shopifyGraphQL } from "@/lib/shopify";
import { isRslProjectNo } from "@/lib/order-label";
import {
  isCremationGraphQLOrder,
  productOrderFromGraphQL,
  type ShopifyGraphQLOrder,
} from "@/lib/product-orders";

type OrdersPage = {
  orders: {
    edges: { cursor: string; node: ShopifyGraphQLOrder }[];
    pageInfo: { hasNextPage: boolean };
  };
};

const SYNC_QUERY = `query ProductOrders($after: String) {
  orders(first: 250, after: $after, sortKey: CREATED_AT, reverse: true) {
    edges { cursor node {
      id name createdAt updatedAt cancelledAt email phone
      displayFinancialStatus displayFulfillmentStatus
      customAttributes { key value }
      customer {
        displayName
        defaultEmailAddress { emailAddress }
        defaultPhoneNumber { phoneNumber }
        defaultAddress { phone }
      }
      shippingAddress { phone }
      billingAddress { phone }
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) { edges { node { title quantity customAttributes { key value } } } }
    } }
    pageInfo { hasNextPage }
  }
}`;

export async function syncProductOrders() {
  if (!(await getStaff())) redirect("/login");

  let synced = 0;
  try {
    const supabase = createAdminClient();
    let after: string | null = null;

    do {
      const result: OrdersPage = await shopifyGraphQL<OrdersPage>(SYNC_QUERY, { after });
      const edges = result.orders.edges;
      const productRows = edges
        .map(({ node }) => node)
        .filter((order) => !isCremationGraphQLOrder(order))
        .map(productOrderFromGraphQL);

      if (productRows.length) {
        const { error } = await supabase
          .from("product_orders")
          .upsert(productRows, { onConflict: "shopify_order_id" });
        if (error) throw error;
      }

      synced += productRows.length;
      after = result.orders.pageInfo.hasNextPage ? edges.at(-1)?.cursor || null : null;
    } while (after);

    revalidatePath("/orders");
    revalidatePath("/crm");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/orders?sync_error=${encodeURIComponent(message.slice(0, 180))}`);
  }
  redirect(`/orders?synced=${synced}`);
}

export type SouvenirDraftState = {
  error?: string;
  draft?: {
    id: string;
    name: string;
    invoiceUrl: string | null;
    adminUrl: string;
    amount: string;
    currency: string;
    customerName: string;
    email: string;
  };
};

export type DraftInvoiceState = { error?: string; sent?: boolean };

type CreateDraftResponse = {
  draftOrderCreate: {
    draftOrder: {
      id: string;
      name: string;
      invoiceUrl: string | null;
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
    } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};

const CREATE_DRAFT_MUTATION = `mutation CreateSouvenirDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      name
      invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
    }
    userErrors { field message }
  }
}`;

const SEND_DRAFT_INVOICE_MUTATION = `mutation SendSouvenirDraftInvoice($id: ID!) {
  draftOrderInvoiceSend(id: $id) {
    draftOrder { id }
    userErrors { field message }
  }
}`;

export async function createSouvenirDraftOrder(
  _previous: SouvenirDraftState,
  formData: FormData
): Promise<SouvenirDraftState> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (staff.role !== "admin") return { error: "只有管理員可以建立 Shopify 草稿訂單。" };

  const customerName = String(formData.get("customerName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const petName = String(formData.get("petName") || "").trim();
  const projectNo = String(formData.get("projectNo") || "").trim().toUpperCase();
  const extraNote = String(formData.get("note") || "").trim();

  if (!customerName || customerName.length > 120) return { error: "請填寫有效的主人名稱。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "請填寫有效的客人電郵，Shopify 會用它寄送付款連結。" };
  if (phone.length > 40 || petName.length > 120 || extraNote.length > 1000) return { error: "電話、寵物名稱或備註太長，請縮短後再試。" };
  if (projectNo && !isRslProjectNo(projectNo)) return { error: "專案編號格式應為 RSL-年月日-代碼。" };

  let submittedLines: unknown;
  try {
    submittedLines = JSON.parse(String(formData.get("lineItems") || ""));
  } catch {
    return { error: "商品資料無效，請重新選擇商品。" };
  }
  if (!Array.isArray(submittedLines) || submittedLines.length === 0 || submittedLines.length > 20) {
    return { error: "請選擇 1 至 20 項商品。" };
  }

  const quantities = new Map<string, number>();
  for (const raw of submittedLines) {
    if (!raw || typeof raw !== "object") return { error: "商品資料無效，請重新選擇商品。" };
    const line = raw as { variantId?: unknown; quantity?: unknown };
    const variantId = String(line.variantId || "");
    const quantity = Number(line.quantity);
    if (!/^gid:\/\/shopify\/ProductVariant\/[A-Za-z0-9_-]+$/.test(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: "商品或數量資料無效，請重新選擇。" };
    }
    const combined = (quantities.get(variantId) || 0) + quantity;
    if (combined > 99) return { error: "同一商品數量不可超過 99。" };
    quantities.set(variantId, combined);
  }

  const note = [
    "Resoul Admin 紀念品訂單",
    `主人：${customerName}`,
    petName ? `寵物：${petName}` : "",
    phone ? `電話：${phone}` : "",
    projectNo ? `專案編號：${projectNo}` : "",
    extraNote ? `備註：${extraNote}` : "",
  ].filter(Boolean).join("\n");
  const attributes = [
    { key: "Owner", value: customerName },
    ...(petName ? [{ key: "Pet", value: petName }] : []),
    ...(phone ? [{ key: "Phone", value: phone }] : []),
    ...(projectNo ? [{ key: "Project No", value: projectNo }] : []),
  ];
  const projectAttributes = projectNo ? [{ key: "Project No", value: projectNo }] : [];
  const input = {
    email,
    ...(phone ? { phone } : {}),
    note,
    tags: ["Resoul Admin", "Memorial Product"],
    customAttributes: attributes,
    lineItems: [...quantities.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
      customAttributes: projectAttributes,
    })),
  };

  try {
    const result = await shopifyGraphQL<CreateDraftResponse>(CREATE_DRAFT_MUTATION, { input });
    const payload = result.draftOrderCreate;
    if (payload.userErrors.length) return { error: payload.userErrors.map((e) => e.message).join("；") };
    if (!payload.draftOrder) return { error: "Shopify 沒有回傳草稿訂單，請稍後再試。" };

    const draft = payload.draftOrder;
    const host = shopDomain().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const numericId = draft.id.split("/").pop() || "";
    return {
      draft: {
        id: draft.id,
        name: draft.name,
        invoiceUrl: draft.invoiceUrl,
        adminUrl: `https://${host}/admin/draft_orders/${numericId}`,
        amount: draft.totalPriceSet.shopMoney.amount,
        currency: draft.totalPriceSet.shopMoney.currencyCode,
        customerName,
        email,
      },
    };
  } catch (error) {
    console.error("[souvenir_draft_create]", error instanceof Error ? error.message : "unknown error");
    return { error: "建立 Shopify 草稿訂單失敗，請確認 Shopify 連線及商品狀態後重試。" };
  }
}

type SendInvoiceResponse = {
  draftOrderInvoiceSend: {
    draftOrder: { id: string } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};

export async function sendSouvenirDraftInvoice(
  _previous: DraftInvoiceState,
  formData: FormData
): Promise<DraftInvoiceState> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (staff.role !== "admin") return { error: "只有管理員可以寄送付款連結。" };

  const id = String(formData.get("draftId") || "");
  if (!/^gid:\/\/shopify\/DraftOrder\/[A-Za-z0-9_-]+$/.test(id)) return { error: "草稿訂單編號無效。" };

  try {
    const result = await shopifyGraphQL<SendInvoiceResponse>(SEND_DRAFT_INVOICE_MUTATION, { id });
    const payload = result.draftOrderInvoiceSend;
    if (payload.userErrors.length) return { error: payload.userErrors.map((e) => e.message).join("；") };
    if (!payload.draftOrder) return { error: "Shopify 沒有確認寄送結果，請到 Shopify 草稿訂單核對。" };
    return { sent: true };
  } catch (error) {
    console.error("[souvenir_draft_invoice]", error instanceof Error ? error.message : "unknown error");
    return { error: "付款連結未能寄出，請到 Shopify 草稿訂單確認後再試。" };
  }
}
