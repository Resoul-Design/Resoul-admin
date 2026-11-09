"use server";

// 接送訂金抵扣：已付的接送訂金可套用於同一專案編號的一張火化預約或一張紀念品草稿訂單（每筆訂金只可使用一次）。
// 套用後於 Shopify 付款頁加入「接送訂金抵扣」折扣，並在 Shopify（草稿及接送訂單）及後台備註留下記錄；付款核對會扣除抵扣額。
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { shopifyGraphQL } from "@/lib/shopify";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { appendNote } from "@/lib/payment-check";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import { depositCreditValue } from "@/lib/deposit-amount";

export type CreditTarget = { kind: "cremation"; id: string } | { kind: "draft"; id: string };
export type AvailableCredit = { id: string; projectNo: string; owner: string; pet: string; amount: number; paidAt: string; invoiceNo: number | null; isTest: boolean };
export type CreditStatus = {
  ready: boolean; // 已執行 migration
  applied: { depositId: string; amount: number; projectNo: string } | null;
  available: AvailableCredit[];
  targetAmount: number | null;
  projectNo: string;
  error?: string;
};
type Result = { error?: string; warning?: string };

const NOT_READY = "未啟用訂金抵扣：請先於 Supabase 執行 db/migration_20261101_deposit_credit.sql。";
const ATTR_KEY = "Deposit credit"; // Shopify 草稿／訂單上的抵扣記錄
const DRAFT_QUERY = `query CreditDraft($id: ID!) { draftOrder(id: $id) { note2 tags customAttributes { key value } } }`;
const UPDATE_DRAFT = `mutation ApplyDepositCredit($id: ID!, $input: DraftOrderInput!) {
  draftOrderUpdate(id: $id, input: $input) {
    draftOrder { id }
    userErrors { field message }
  }
}`;
const ORDER_QUERY = `query CreditOrder($id: ID!) { order(id: $id) { note customAttributes { key value } } }`;
const UPDATE_ORDER = `mutation RecordDepositCredit($input: OrderInput!) {
  orderUpdate(input: $input) { order { id } userErrors { field message } }
}`;
type Attr = { key: string; value: string };
type UserErrors = { userErrors: { message: string }[] };

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const targetKey = (t: CreditTarget) => `${t.kind}:${t.id}`;
const kindLabel = (t: CreditTarget) => (t.kind === "cremation" ? "火化預約" : "紀念品訂單");
const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const orderGid = (id: string | null | undefined) => (!id ? null : id.startsWith("gid://") ? id : /^\d+$/.test(id) ? `gid://shopify/Order/${id}` : null);
const NOTE_PREFIX = "💰 接送訂金抵扣";

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

// 目標資料：專案編號、應付金額、草稿 id、是否已付款
async function loadTarget(t: CreditTarget) {
  const admin = createAdminClient();
  if (t.kind === "cremation") {
    const { data: b } = await admin.from("cremation_bookings").select("id, case_no, notes, payment_amount, payment_status, source").eq("id", t.id).maybeSingle();
    if (!b || String(b.source || "").includes("euthanasia")) return { error: "找不到此火化預約。" };
    const { data: mark } = await admin.from("follow_up_marks").select("payment_draft_id").eq("entity", "cremation").eq("ref", t.id).maybeSingle();
    const no = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
    return {
      projectNo: no === "—" ? "" : no, amount: b.payment_amount != null ? Number(b.payment_amount) : null,
      paid: b.payment_status === "paid", draftId: (mark?.payment_draft_id as string | null) || null, name: "",
    };
  }
  const d = (await loadSouvenirDrafts()).find((x) => x.id === t.id);
  if (!d) return { error: "找不到此草稿訂單（可能已付款或已刪除）。" };
  return { projectNo: d.projectNo, amount: d.amount, paid: false, draftId: d.id, name: d.name };
}

// Shopify 草稿：套用／取消折扣，並在備註、自訂欄位及標籤留下抵扣記錄（record 為 null＝取消）
async function setDraftCredit(draftId: string, record: { amount: number; text: string } | null) {
  const cur = await shopifyGraphQL<{ draftOrder: { note2: string | null; tags: string[]; customAttributes: Attr[] } | null }>(DRAFT_QUERY, { id: draftId });
  if (!cur.draftOrder) throw new Error("draft not found");
  const lines = String(cur.draftOrder.note2 || "").split("\n").filter((l) => l && !l.startsWith(NOTE_PREFIX));
  const attrs = cur.draftOrder.customAttributes.filter((a) => a.key !== ATTR_KEY).map(({ key, value }) => ({ key, value }));
  const tags = cur.draftOrder.tags.filter((tag) => tag !== "Deposit Credit");
  const input = record
    ? {
        appliedDiscount: { title: "接送訂金抵扣", description: record.text.slice(0, 255), value: record.amount, valueType: "FIXED_AMOUNT" },
        note: [...lines, `${NOTE_PREFIX}：${record.text}`].join("\n"),
        customAttributes: [...attrs, { key: ATTR_KEY, value: record.text }],
        tags: [...tags, "Deposit Credit"],
      }
    : { appliedDiscount: null, note: lines.join("\n"), customAttributes: attrs, tags };
  const res = await shopifyGraphQL<{ draftOrderUpdate: UserErrors }>(UPDATE_DRAFT, { id: draftId, input });
  const errs = res.draftOrderUpdate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join("；"));
}

// Shopify 已付款的接送訂單：在備註及自訂欄位記錄用於哪張單（text 為 null＝移除記錄）。失敗不影響抵扣。
async function recordOnDepositOrder(orderId: string | null, text: string | null): Promise<boolean> {
  const id = orderGid(orderId);
  if (!id) return false;
  try {
    const cur = await shopifyGraphQL<{ order: { note: string | null; customAttributes: Attr[] } | null }>(ORDER_QUERY, { id });
    if (!cur.order) return false;
    const lines = String(cur.order.note || "").split("\n").filter((l) => l && !l.startsWith(NOTE_PREFIX));
    const attrs = cur.order.customAttributes.filter((a) => a.key !== ATTR_KEY).map(({ key, value }) => ({ key, value }));
    const input = text
      ? { id, note: [...lines, `${NOTE_PREFIX}：${text}`].join("\n"), customAttributes: [...attrs, { key: ATTR_KEY, value: text }] }
      : { id, note: lines.join("\n"), customAttributes: attrs };
    const res = await shopifyGraphQL<{ orderUpdate: UserErrors }>(UPDATE_ORDER, { input });
    return !res.orderUpdate.userErrors.length;
  } catch (e) {
    console.error("[deposit_credit_order_note]", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

export async function getCreditStatus(t: CreditTarget): Promise<CreditStatus> {
  const empty = { ready: true, applied: null, available: [], targetAmount: null, projectNo: "" };
  const g = await guard(t);
  if ("error" in g) return { ...empty, error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { ...empty, error: target.error };
  const admin = createAdminClient();
  const appliedRes = await admin.from("deposit_bookings").select("id, credit_amount, project_no").eq("credit_target", targetKey(t)).maybeSingle();
  if (appliedRes.error) return { ...empty, ready: false, targetAmount: target.amount, error: NOT_READY };
  const applied = appliedRes.data ? { depositId: appliedRes.data.id, amount: Number(appliedRes.data.credit_amount || 0), projectNo: appliedRes.data.project_no || "" } : null;
  const base = { ready: true, applied, targetAmount: target.amount, projectNo: target.projectNo };
  if (!target.projectNo) return { ...base, available: [], error: applied ? undefined : "此單未有專案編號，不能抵扣接送訂金。請先為此單連結專案編號。" };
  // 只限同一專案編號、已付款、未使用、未取消的接送訂金
  const { data: deps } = await admin
    .from("deposit_bookings")
    .select("id, project_no, owner_name, pet_name, payment_amount, paid_at, status, is_test, invoice_no")
    .eq("project_no", target.projectNo)
    .eq("payment_status", "paid")
    .is("credit_target", null)
    .neq("status", "cancelled")
    .order("paid_at", { ascending: false });
  const available = (deps || []).map((d) => ({
    id: d.id, projectNo: d.project_no || "", owner: d.owner_name || "", pet: d.pet_name || "", amount: depositCreditValue(d.payment_amount),
    paidAt: d.paid_at || "", invoiceNo: d.invoice_no ?? null, isTest: !!d.is_test,
  }));
  return { ...base, available };
}

export async function applyDepositCredit(t: CreditTarget, depositId: string): Promise<Result> {
  const g = await guard(t);
  if ("error" in g) return { error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { error: target.error };
  if (target.paid) return { error: "此單已付款，不能再套用訂金。" };
  if (!(target.amount && target.amount > 0)) return { error: "此單未有收費金額，請先於「編輯資料」填寫收費金額。" };
  if (!target.projectNo) return { error: "此單未有專案編號，不能抵扣接送訂金。" };
  const admin = createAdminClient();
  const exists = await admin.from("deposit_bookings").select("id").eq("credit_target", targetKey(t)).maybeSingle();
  if (exists.error) return { error: NOT_READY };
  if (exists.data) return { error: "此單已套用一筆接送訂金。" };
  const { data: dep } = await admin
    .from("deposit_bookings")
    .select("id, project_no, payment_status, payment_amount, credit_target, notes, shopify_order_id, invoice_no")
    .eq("id", depositId)
    .maybeSingle();
  if (!dep || dep.payment_status !== "paid") return { error: "此接送訂金未付款，不能抵扣。" };
  if (dep.project_no !== target.projectNo) return { error: `只可抵扣同一專案編號（${target.projectNo}）的接送訂金。` };
  if (dep.credit_target) return { error: "此接送訂金已用於另一張單。" };
  const credit = Math.min(depositCreditValue(dep.payment_amount), target.amount);

  // 先標記訂金已使用（避免同時套用兩次），再更新 Shopify 草稿
  const { data: claimed, error: claimErr } = await admin
    .from("deposit_bookings")
    .update({ credit_target: targetKey(t), credit_amount: credit, credit_applied_at: new Date().toISOString() })
    .eq("id", depositId).is("credit_target", null).select("id");
  if (claimErr) return { error: NOT_READY };
  if (!claimed?.length) return { error: "此接送訂金已用於另一張單。" };

  const label = kindLabel(t);
  const depRef = dep.invoice_no ? `接送訂金（單號 ${dep.invoice_no}）` : "接送訂金";
  const text = `${depRef} ${hk(credit)}（${target.projectNo}）`;
  if (target.draftId) {
    try {
      await setDraftCredit(target.draftId, { amount: credit, text });
    } catch (e) {
      await admin.from("deposit_bookings").update({ credit_target: null, credit_amount: null, credit_applied_at: null }).eq("id", depositId);
      console.error("[deposit_credit]", e instanceof Error ? e.message : "unknown");
      return { error: "未能更新 Shopify 付款頁的折扣，請稍後再試。" };
    }
  }
  if (t.kind === "cremation") {
    const { data: b } = await admin.from("cremation_bookings").select("notes").eq("id", t.id).maybeSingle();
    const { error } = await admin
      .from("cremation_bookings")
      .update({ deposit_credit: credit, deposit_credit_ref: depositId, notes: appendNote(b?.notes, `${NOTE_PREFIX} ${today()}：${text}`) })
      .eq("id", t.id);
    if (error) return { error: NOT_READY };
  }
  const targetRef = t.kind === "cremation" ? `火化預約（${target.projectNo}）` : `紀念品訂單 ${target.name}`;
  await admin.from("deposit_bookings").update({ notes: appendNote(dep.notes, `${NOTE_PREFIX} ${today()}：${hk(credit)} 用於${targetRef}`) }).eq("id", depositId);
  const recorded = await recordOnDepositOrder(dep.shopify_order_id, `${hk(credit)} 用於${targetRef}`);
  await logAudit("apply_deposit_credit", "deposit_bookings", depositId, `${label}｜${target.projectNo}｜抵扣 ${hk(credit)}`);
  revalidate();
  const reload = target.draftId ? "如 Shopify 已開啟此付款連結頁面，請先重新整理再修改，否則舊頁面儲存會覆蓋折扣。" : "";
  return recorded || !dep.shopify_order_id ? (reload ? { warning: `已套用抵扣。${reload}` } : {}) : { warning: `已套用抵扣，但未能在 Shopify 接送訂單加入記錄（後台已記錄）。${reload}` };
}

export async function removeDepositCredit(t: CreditTarget): Promise<Result> {
  const g = await guard(t);
  if ("error" in g) return { error: g.error };
  const target = await loadTarget(t);
  if ("error" in target) return { error: target.error };
  if (target.paid) return { error: "此單已付款，不能取消抵扣。" };
  const admin = createAdminClient();
  const { data: dep, error } = await admin.from("deposit_bookings").select("id, notes, shopify_order_id, credit_amount").eq("credit_target", targetKey(t)).maybeSingle();
  if (error) return { error: NOT_READY };
  if (!dep) return { error: "此單未有套用接送訂金。" };
  if (target.draftId) {
    try { await setDraftCredit(target.draftId, null); } catch (e) {
      console.error("[deposit_credit_remove]", e instanceof Error ? e.message : "unknown");
      return { error: "未能取消 Shopify 付款頁的折扣，請稍後再試。" };
    }
  }
  const line = `${NOTE_PREFIX}已取消 ${today()}：${hk(Number(dep.credit_amount || 0))}（${kindLabel(t)}）`;
  await admin.from("deposit_bookings").update({ credit_target: null, credit_amount: null, credit_applied_at: null, notes: appendNote(dep.notes, line) }).eq("id", dep.id);
  if (t.kind === "cremation") {
    const { data: b } = await admin.from("cremation_bookings").select("notes").eq("id", t.id).maybeSingle();
    await admin.from("cremation_bookings").update({ deposit_credit: null, deposit_credit_ref: null, notes: appendNote(b?.notes, line) }).eq("id", t.id);
  }
  await recordOnDepositOrder(dep.shopify_order_id, null);
  await logAudit("remove_deposit_credit", "deposit_bookings", dep.id, `${kindLabel(t)}｜${target.projectNo}`);
  revalidate();
  return {};
}

// 接送服務頁：查看此訂金是否已用於抵扣
export type DepositLedger = { invoiceNo: number; received: number; applied: number; balance: number; rows: { date: string; kind: string; amount: number }[] };
const LEDGER_KIND: Record<string, string> = { received: "收取訂金", applied: "抵扣", released: "取消抵扣", refunded: "退款", adjustment: "調整" };

// 按公司單號讀取訂金流水及可扣餘額
async function loadLedger(invoiceNo: number | null | undefined): Promise<DepositLedger | undefined> {
  if (!invoiceNo) return undefined;
  const { data } = await createAdminClient().from("deposit_ledger").select("kind, amount, created_at").eq("invoice_no", invoiceNo).order("created_at");
  if (!data) return undefined;
  const sum = (kinds: string[]) => data.filter((r) => kinds.includes(r.kind)).reduce((n, r) => n + Number(r.amount), 0);
  return {
    invoiceNo,
    received: sum(["received"]),
    applied: -sum(["applied", "released"]),
    balance: data.reduce((n, r) => n + Number(r.amount), 0),
    rows: data.map((r) => ({ date: new Date(Date.parse(r.created_at) + 8 * 3600 * 1000).toISOString().slice(0, 10), kind: LEDGER_KIND[r.kind] || r.kind, amount: Number(r.amount) })),
  };
}

export async function getDepositCreditUse(depositId: string): Promise<{ text: string; error?: string; ledger?: DepositLedger }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["deposits"])) return { text: "", error: "沒有此功能的使用權限。" };
  const { data, error } = await createAdminClient().from("deposit_bookings").select("payment_status, project_no, credit_target, credit_amount, credit_applied_at, invoice_no").eq("id", depositId).maybeSingle();
  if (error) return { text: "", error: NOT_READY };
  if (!data) return { text: "", error: "找不到此接送服務。" };
  const ledger = await loadLedger(data.invoice_no);
  if (data.payment_status !== "paid") return { text: "此訂金尚未付款，付款後才可用於抵扣。", ledger };
  if (!data.credit_target) {
    return { text: data.project_no
      ? `此訂金尚未使用。只可抵扣同一單號${data.invoice_no ? ` ${data.invoice_no}` : ""}（專案 ${data.project_no}）的火化預約或紀念品草稿訂單：在該單「💳 付款及單據 → 💰 套用接送訂金」使用。`
      : "此訂金未有專案編號，不能用於抵扣。", ledger };
  }
  const kind = String(data.credit_target).startsWith("cremation:") ? "火化預約／安樂在家" : String(data.credit_target).startsWith("company:") ? "開新單" : "紀念品訂單";
  const date = data.credit_applied_at ? new Date(Date.parse(data.credit_applied_at) + 8 * 3600 * 1000).toISOString().slice(0, 10) : "";
  return { text: `已於 ${date} 用於${kind}，抵扣 ${hk(Number(data.credit_amount || 0))}。如需取消，請在該${kind}的「💰 套用接送訂金」取消。`, ledger };
}
