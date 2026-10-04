// 後台建立 Shopify 草稿訂單時附上顧客資料（主人名、電話、電郵），令草稿及其後的訂單顯示顧客。
// 後台只有 read_customers 權限：只會連結 Shopify 已有的顧客（按電郵或電話），不會新增顧客。
import { shopifyGraphQL } from "@/lib/shopify";

export type DraftCustomer = { name?: string | null; phone?: string | null; email?: string | null };

// 香港 8 位電話轉為 +852XXXXXXXX；其他格式不傳（避免 Shopify 拒絕草稿）
export function hkPhoneE164(phone?: string | null) {
  const digits = (phone || "").replace(/\D/g, "");
  if (/^[2-9]\d{7}$/.test(digits)) return `+852${digits}`;
  if (/^852[2-9]\d{7}$/.test(digits)) return `+${digits}`;
  return "";
}

const CUSTOMER_QUERY = `query FindCustomer($query: String!) {
  customers(first: 1, query: $query) { nodes { id } }
}`;

export async function draftCustomerFields(who: DraftCustomer): Promise<Record<string, unknown>> {
  const name = (who.name || "").trim();
  const email = (who.email || "").trim();
  const phone = hkPhoneE164(who.phone);
  const fields: Record<string, unknown> = {};
  if (email) fields.email = email;
  if (phone) fields.phone = phone;
  if (name || phone) fields.billingAddress = { ...(name ? { firstName: name } : {}), ...(phone ? { phone } : {}), countryCode: "HK" };
  const terms = [email ? `email:${email}` : "", phone ? `phone:${phone}` : ""].filter(Boolean).join(" OR ");
  if (terms) {
    try {
      const res = await shopifyGraphQL<{ customers: { nodes: { id: string }[] } }>(CUSTOMER_QUERY, { query: terms });
      const id = res.customers.nodes[0]?.id;
      if (id) fields.purchasingEntity = { customerId: id };
    } catch {
      // 查詢失敗不影響建立草稿
    }
  }
  return fields;
}

type DraftCreateResult = { draftOrderCreate: { userErrors: { message: string }[] } };

// 建立草稿：先附顧客資料；如 Shopify 因電話、地址或顧客資料拒絕，改為不附顧客資料再建立一次
export async function createDraftWithCustomer<T extends DraftCreateResult>(mutation: string, input: Record<string, unknown>, who: DraftCustomer): Promise<T> {
  const extra = await draftCustomerFields(who);
  const first = await shopifyGraphQL<T>(mutation, { input: { ...input, ...extra } });
  const errors = first.draftOrderCreate.userErrors;
  if (errors.length && Object.keys(extra).length && errors.some((e) => /phone|address|customer|email|電話|地址|顧客|電郵/i.test(e.message))) {
    return shopifyGraphQL<T>(mutation, { input });
  }
  return first;
}
