// 接送訂金折扣重新套用：後台已記錄抵扣，但 Shopify 付款連結草稿上的折扣不見了或金額不對
// （例如在 Shopify 開住舊頁面加減項目後儲存，會以舊內容覆蓋折扣）。對帳及「全部同步」使用。
// 抵扣額＝訂金（上限 DEPOSIT_AMOUNT）與草稿小計的較小者；草稿已付款則不改。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { appendNote } from "@/lib/payment-check";
import { depositCreditValue } from "@/lib/deposit-amount";

const ATTR_KEY = "Deposit credit";
const TAG = "Deposit Credit";
const NOTE_PREFIX = "💰 接送訂金抵扣";
const DRAFT = `query CreditRepairDraft($id: ID!) { draftOrder(id: $id) { id name status order { id } note2 tags customAttributes { key value } appliedDiscount { value valueType } subtotalPriceSet { shopMoney { amount } } } }`;
const UPDATE = `mutation CreditRepair($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id } userErrors { message } } }`;
type Draft = { id: string; name: string; status: string; order: { id: string } | null; note2: string | null; tags: string[]; customAttributes: { key: string; value: string | null }[]; appliedDiscount: { value: number; valueType: string } | null; subtotalPriceSet: { shopMoney: { amount: string } } };

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// 抵扣目標的付款連結草稿 ID
export async function creditDraftId(target: string): Promise<string | null> {
  if (target.startsWith("draft:")) return target.slice(6);
  if (target.startsWith("cremation:")) {
    const { data } = await createAdminClient().from("follow_up_marks").select("payment_draft_id").in("entity", ["cremation", "vet"]).eq("ref", target.slice(10)).not("payment_draft_id", "is", null).maybeSingle();
    return (data?.payment_draft_id as string | null) || null;
  }
  if (target.startsWith("company:")) {
    const { data } = await createAdminClient().from("company_orders").select("shopify_draft_id, shopify_order_id").eq("id", target.slice(8)).maybeSingle();
    return data && !data.shopify_order_id ? (data.shopify_draft_id as string | null) || null : null;
  }
  return null;
}

// 應有的抵扣額及 Shopify 現有折扣是否一致
export function creditMismatch(depositAmount: unknown, recorded: unknown, d: { appliedDiscount: { value: number; valueType: string } | null; subtotalPriceSet: { shopMoney: { amount: string } } }) {
  const expected = Math.min(depositCreditValue(depositAmount), Number(d.subtotalPriceSet.shopMoney.amount));
  const shopify = d.appliedDiscount && d.appliedDiscount.valueType === "FIXED_AMOUNT" ? Number(d.appliedDiscount.value) : 0;
  return { expected, shopify, mismatch: expected > 0 && (Math.abs(shopify - expected) > 0.005 || Math.abs(Number(recorded || 0) - expected) > 0.005) };
}

export async function reapplyDepositCredit(depositId: string, who: string): Promise<{ error?: string; done?: string }> {
  const admin = createAdminClient();
  const { data: dep } = await admin.from("deposit_bookings").select("id, invoice_no, payment_amount, credit_target, credit_amount, notes").eq("id", depositId).maybeSingle();
  if (!dep?.credit_target) return { error: "此訂金未有抵扣記錄。" };
  const draftId = await creditDraftId(String(dep.credit_target));
  if (!draftId) return { error: "找不到抵扣目標的付款連結。" };
  const { draftOrder: d } = await shopifyGraphQL<{ draftOrder: Draft | null }>(DRAFT, { id: draftId });
  if (!d) return { error: "Shopify 付款連結已刪除，請在後台取消此抵扣。" };
  if (d.order || d.status === "COMPLETED") return { error: `Shopify ${d.name} 已付款，不能再改折扣。` };
  const { expected, shopify } = creditMismatch(dep.payment_amount, dep.credit_amount, d);
  if (expected <= 0) return { error: "付款連結金額為 0，不能套用折扣。" };
  const projectNo = (d.customAttributes.find((a) => a.key === "Project No")?.value || "").trim();
  const text = `接送訂金${dep.invoice_no ? `（單號 ${dep.invoice_no}）` : ""} ${hk(expected)}${projectNo ? `（${projectNo}）` : ""}`;
  const lines = String(d.note2 || "").split("\n").filter((l) => l && !l.startsWith(NOTE_PREFIX));
  const attrs = d.customAttributes.filter((a) => a.key !== ATTR_KEY).map((a) => ({ key: a.key, value: a.value || "" }));
  const res = await shopifyGraphQL<{ draftOrderUpdate: { userErrors: { message: string }[] } }>(UPDATE, {
    id: d.id,
    input: {
      appliedDiscount: { title: "接送訂金抵扣", description: text.slice(0, 255), value: expected, valueType: "FIXED_AMOUNT" },
      note: [...lines, `${NOTE_PREFIX}：${text}`].join("\n"),
      customAttributes: [...attrs, { key: ATTR_KEY, value: text }],
      tags: [...d.tags.filter((t) => t !== TAG), TAG],
    },
  });
  if (res.draftOrderUpdate.userErrors.length) return { error: `Shopify 未能套用折扣：${res.draftOrderUpdate.userErrors.map((e) => e.message).join("；")}` };

  // 抵扣額改變：更新記錄及訂金流水（觸發器只記錄套用／取消，金額調整在此補記）
  const before = Number(dep.credit_amount || 0);
  if (Math.abs(before - expected) > 0.005) {
    await admin.from("deposit_bookings").update({ credit_amount: expected, notes: appendNote(dep.notes, `${NOTE_PREFIX}調整 ${today()}：${hk(before)} → ${hk(expected)}（${d.name}，${who}）`) }).eq("id", dep.id);
    if (dep.invoice_no) await admin.from("deposit_ledger").insert({ invoice_no: dep.invoice_no, kind: "adjustment", amount: before - expected, deposit_id: dep.id, target: dep.credit_target, note: `抵扣額調整（${d.name}）`, created_by: who });
    const target = String(dep.credit_target);
    if (target.startsWith("cremation:")) await admin.from("cremation_bookings").update({ deposit_credit: expected }).eq("id", target.slice(10));
  }
  return { done: `已在 Shopify ${d.name} 重新套用接送訂金折扣 ${hk(expected)}${Math.abs(shopify - expected) > 0.005 ? `（原本 ${hk(shopify)}）` : ""}。` };
}
