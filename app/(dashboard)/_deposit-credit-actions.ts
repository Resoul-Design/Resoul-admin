"use server";

// 接送訂金抵扣：已付的接送訂金可套用於一張火化預約或一張紀念品草稿訂單（每筆訂金只可使用一次）。
// 套用後於 Shopify 付款頁加入「接送訂金抵扣」折扣；付款核對會扣除抵扣額。
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { shopifyGraphQL } from "@/lib/shopify";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { phoneKey } from "@/lib/product-orders";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";

export type CreditTarget = { kind: "cremation"; id: string } | { kind: "draft"; id: string };
export type AvailableCredit = { id: string; projectNo: string; owner: string; pet: string; amount: number; paidAt: string; isTest: boolean };
export type CreditStatus = {
  ready: boolean; // 已執行 migration
  applied: { depositId: string; amount: number; projectNo: string } | null;
  available: AvailableCredit[];
  targetAmount: number | null;
  error?: string;
};

const NOT_READY = "未啟用訂金抵扣：請先於 Supabase 執行 db/migration_20261101_deposit_credit.sql。";
const UPDATE_DRAFT = `mutation ApplyDepositCredit($id: ID!, $input: DraftOrderInput!) {
  draftOrderUpdate(id: $id, input: $input) {
    draftOrder { id invoiceUrl totalPriceSet { shopMoney { amount } } }
    userErrors { field message }
  }
}`;
type UpdateResponse = { draftOrderUpdate: { draftOrder: { id: string; invoiceUrl: string | null } | null; userErrors: { message: string }[] } };

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const targetKey = (t: CreditTarget) => `${t.kind}:${t.id}`;

async function guard(t: CreditTarget) {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" } as const;
  const mod = t.kind === "cremation" ? "bookings" : "orders";
  if (!hasModule(staff, [mod])) return { error: "沒有此功能的使用權限。" } as const;
  if (t.kind === "cremation" ? !/^[0-9a-f-]{36}$/i.test(t.id) : !/^gid:\/\/shopify\/DraftOrder\/\d+$/.test(t.id)) return { error: "記錄無效。" } as const;
  return { staff } as const;
}

function revalidate() {
  revalidatePath("/deposits");
  revalidatePath("/bookings");
  revalidatePath("/orders");
}

// 目標資料：專案編號、電話、應付金額、草稿 id、是否已付款
async function loadTarget(t: CreditTarget) {
  const admin = createAdminClient();
  if (t.kind === "cremation") {
    const { data: b } = await admin.from("cremation_bookings").select("id, case_no, notes, contact, payment_amount, payment_status, source").eq("id", t.id).maybeSingle();
    if (!b || String(b.source || "").includes("euthanasia")) return { error: "找不到此火化預約。" };
    const { data: mark } = await admin.from("follow_up_marks").select("payment_draft_id").eq("entity", "cremation").eq("ref", t.id).maybeSingle();
    const no = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
    return {
      projectNo: no === "—" ? "" : no, phone: b.contact || "", amount: b.payment_amount != null ? Number(b.payment_amount) : null,
      paid: b.payment_status === "paid", draftId: (mark?.payment_draft_id as string | null) || null, notes: b.notes as string | null,
    };
  }
  const d = (await loadSouvenirDrafts()).find((x) => x.id === t.id);
  if (!d) return { error: "找不到此草稿訂單（可能已付款或已刪除）。" };
  return { projectNo: d.projectNo, phone: d.phone, amount: d.amount, paid: false, draftId: d.id, notes: null };
}

// 套用／取消 Shopify 草稿折扣（amount 為 null＝取消）
async function setDraftDiscount(draftId: string, amount: number | null, projectNo: string) {
  const input = amount
    ? { appliedDiscount: { title: "接送訂金抵扣", description: `已付接送訂金${projectNo ? `（${projectNo}）` : ""}`, value: amount, valueType: "FIXED_AMOUNT" } }
    : { appliedDiscount: null };
  const res = await shopifyGraphQL<UpdateResponse>(UPDATE_DRAFT, { id: draftId, input });
  const errs = res.draftOrderUpdate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join("；"));
}

export async function getCreditStatus(t: CreditTarget): Promise<CreditStatus> {
  const g = await guard(t);
  if ("error" in g) return { ready: true, applied: null, available: [], targetAmount: null, error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { ready: true, applied: null, available: [], targetAmount: null, error: target.error };
  const admin = createAdminClient();
  const appliedRes = await admin.from("deposit_bookings").select("id, credit_amount, project_no").eq("credit_target", targetKey(t)).maybeSingle();
  if (appliedRes.error) return { ready: false, applied: null, available: [], targetAmount: target.amount, error: NOT_READY };
  const applied = appliedRes.data ? { depositId: appliedRes.data.id, amount: Number(appliedRes.data.credit_amount || 0), projectNo: appliedRes.data.project_no || "" } : null;
  // 同一專案編號或同一電話、已付款、未使用、未取消的接送訂金
  const { data: deps } = await admin
    .from("deposit_bookings")
    .select("id, project_no, owner_name, pet_name, contact, payment_amount, paid_at, status, is_test")
    .eq("payment_status", "paid")
    .is("credit_target", null)
    .neq("status", "cancelled")
    .order("paid_at", { ascending: false })
    .limit(200);
  const key = phoneKey(target.phone);
  const available = (deps || [])
    .filter((d) => (target.projectNo && d.project_no === target.projectNo) || (key && phoneKey(d.contact) === key))
    .map((d) => ({ id: d.id, projectNo: d.project_no || "", owner: d.owner_name || "", pet: d.pet_name || "", amount: Number(d.payment_amount || 1800), paidAt: d.paid_at || "", isTest: !!d.is_test }));
  return { ready: true, applied, available, targetAmount: target.amount };
}

export async function applyDepositCredit(t: CreditTarget, depositId: string): Promise<{ error?: string }> {
  const g = await guard(t);
  if ("error" in g) return { error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { error: target.error };
  if (target.paid) return { error: "此單已付款，不能再套用訂金。" };
  if (!(target.amount && target.amount > 0)) return { error: "此單未有收費金額，請先於「編輯資料」填寫收費金額。" };
  const admin = createAdminClient();
  const exists = await admin.from("deposit_bookings").select("id").eq("credit_target", targetKey(t)).maybeSingle();
  if (exists.error) return { error: NOT_READY };
  if (exists.data) return { error: "此單已套用一筆接送訂金。" };
  const { data: dep } = await admin.from("deposit_bookings").select("id, project_no, payment_status, payment_amount, credit_target, notes").eq("id", depositId).maybeSingle();
  if (!dep || dep.payment_status !== "paid") return { error: "此接送訂金未付款，不能抵扣。" };
  if (dep.credit_target) return { error: "此接送訂金已用於另一張單。" };
  const credit = Math.min(Number(dep.payment_amount || 1800), target.amount);

  // 先標記訂金已使用（避免同時套用兩次），再更新 Shopify 草稿
  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("deposit_bookings")
    .update({ credit_target: targetKey(t), credit_amount: credit, credit_applied_at: now })
    .eq("id", depositId).is("credit_target", null).select("id");
  if (claimErr) return { error: NOT_READY };
  if (!claimed?.length) return { error: "此接送訂金已用於另一張單。" };

  const label = t.kind === "cremation" ? "火化預約" : "紀念品訂單";
  if (target.draftId) {
    try {
      await setDraftDiscount(target.draftId, credit, dep.project_no || target.projectNo);
    } catch (e) {
      await admin.from("deposit_bookings").update({ credit_target: null, credit_amount: null, credit_applied_at: null }).eq("id", depositId);
      console.error("[deposit_credit]", e instanceof Error ? e.message : "unknown");
      return { error: "未能更新 Shopify 付款頁的折扣，請稍後再試。" };
    }
  }
  if (t.kind === "cremation") {
    const { error } = await admin.from("cremation_bookings").update({ deposit_credit: credit, deposit_credit_ref: depositId }).eq("id", t.id);
    if (error) return { error: NOT_READY };
  }
  await logAudit("apply_deposit_credit", "deposit_bookings", depositId, `${label}｜抵扣 ${hk(credit)}`);
  revalidate();
  return {};
}

export async function removeDepositCredit(t: CreditTarget): Promise<{ error?: string }> {
  const g = await guard(t);
  if ("error" in g) return { error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { error: target.error };
  if (target.paid) return { error: "此單已付款，不能取消抵扣。" };
  const admin = createAdminClient();
  const { data: dep, error } = await admin.from("deposit_bookings").select("id").eq("credit_target", targetKey(t)).maybeSingle();
  if (error) return { error: NOT_READY };
  if (!dep) return { error: "此單未有套用接送訂金。" };
  if (target.draftId) {
    try { await setDraftDiscount(target.draftId, null, ""); } catch (e) {
      console.error("[deposit_credit_remove]", e instanceof Error ? e.message : "unknown");
      return { error: "未能取消 Shopify 付款頁的折扣，請稍後再試。" };
    }
  }
  await admin.from("deposit_bookings").update({ credit_target: null, credit_amount: null, credit_applied_at: null }).eq("id", dep.id);
  if (t.kind === "cremation") await admin.from("cremation_bookings").update({ deposit_credit: null, deposit_credit_ref: null }).eq("id", t.id);
  await logAudit("remove_deposit_credit", "deposit_bookings", dep.id, t.kind === "cremation" ? "火化預約" : "紀念品訂單");
  revalidate();
  return {};
}

// 接送服務頁：查看此訂金是否已用於抵扣
export async function getDepositCreditUse(depositId: string): Promise<{ text: string; error?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["deposits"])) return { text: "", error: "沒有此功能的使用權限。" };
  const { data, error } = await createAdminClient().from("deposit_bookings").select("payment_status, credit_target, credit_amount, credit_applied_at").eq("id", depositId).maybeSingle();
  if (error) return { text: "", error: NOT_READY };
  if (!data) return { text: "", error: "找不到此接送服務。" };
  if (data.payment_status !== "paid") return { text: "此訂金尚未付款，付款後才可用於抵扣。" };
  if (!data.credit_target) return { text: "此訂金尚未使用。可在火化預約或紀念品草稿訂單的「💳 付款及單據 → 💰 套用接送訂金」使用。" };
  const kind = String(data.credit_target).startsWith("cremation:") ? "火化預約" : "紀念品訂單";
  const date = data.credit_applied_at ? new Date(Date.parse(data.credit_applied_at) + 8 * 3600 * 1000).toISOString().slice(0, 10) : "";
  return { text: `已於 ${date} 用於${kind}，抵扣 ${hk(Number(data.credit_amount || 0))}。如需取消，請在該${kind}的「💰 套用接送訂金」取消。` };
}
