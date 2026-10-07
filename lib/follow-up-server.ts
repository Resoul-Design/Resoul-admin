// 統一跟進：伺服器端讀取（follow_up_marks 及各類資料），只可在伺服器使用
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalProjectNo, productOrderProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import type { ProductOrderRow } from "@/lib/product-orders";
import { EMPTY_MARK, followKind, followWaitingNote, type FollowEntity, type FollowItem, type FollowMark, type FollowUpKind } from "@/lib/follow-up";

export type FollowEntry = { item: FollowItem; kind: FollowUpKind };

type MarkRow = {
  ref: string;
  reminded_at: string | null;
  reminder_count: number | null;
  contacted_at: string | null;
  closed_at: string | null;
  payment_link: string | null;
};

// 讀取跟進記錄；未執行 migration_follow_ups.sql 時 ready=false。
// 只有處理過的記錄才有跟進記錄，數量少，故一次讀取該類全部再按 refs 篩選
// （不用 .in() 把大量 ID 放進網址，避免記錄多時網址過長被拒）
export async function loadMarks(entity: FollowEntity, refs: string[]): Promise<{ ready: boolean; map: Map<string, FollowMark> }> {
  const map = new Map<string, FollowMark>();
  const wanted = new Set(refs);
  const { data, error } = await createAdminClient()
    .from("follow_up_marks")
    .select("ref, reminded_at, reminder_count, contacted_at, closed_at, payment_link")
    .eq("entity", entity)
    .limit(10000);
  if (error) return { ready: false, map };
  for (const r of (data || []) as MarkRow[]) {
    if (!wanted.has(r.ref)) continue;
    map.set(r.ref, {
      remindedAt: r.reminded_at,
      reminderCount: Number(r.reminder_count || 0),
      contactedAt: r.contacted_at,
      closedAt: r.closed_at,
      paymentLink: r.payment_link,
    });
  }
  return { ready: true, map };
}

export type BookingForFollow = {
  id: string;
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  service_date: string | null;
  service_time: string | null;
  status: string;
  payment_status?: string | null;
  payment_amount?: number | null;
  plan: string | null;
  notes?: string | null;
  case_no: string | null;
  source: string | null;
};

const productFromNotes = (notes?: string | null) => (notes || "").match(/產品[:：]\s*([^|｜]+)/)?.[1]?.trim() || "";

export function bookingFollowItem(b: BookingForFollow, mark: FollowMark = EMPTY_MARK): FollowItem {
  const vet = (b.source || "").includes("euthanasia");
  const pay = (b.payment_status || "pending") as FollowItem["paymentStatus"];
  const no = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
  return {
    entity: vet ? "vet" : "cremation",
    ref: b.id,
    createdAt: b.created_at,
    owner: (b.owner_name || "").trim(),
    contact: b.contact || "",
    pet: (b.pet_name || "").trim(),
    serviceDate: b.service_date || "",
    serviceTime: b.service_time || "",
    status: b.status,
    paymentStatus: vet ? "none" : ["paid", "pending", "failed", "refunded"].includes(pay) ? pay : "pending",
    amount: b.payment_amount != null ? Number(b.payment_amount) : null,
    label: productFromNotes(b.notes) || b.plan || "",
    projectNo: no === "—" ? "" : no,
    english: /-en$/.test(b.source || "") || /Project no\./i.test(b.notes || ""),
    mark,
  };
}

// 火化／獸醫：一次過計算整頁的跟進（ready=false 代表未執行 migration）
export async function bookingFollowUps(bookings: BookingForFollow[], entity: "cremation" | "vet") {
  const { ready, map } = await loadMarks(entity, bookings.map((b) => b.id));
  const result = new Map<string, FollowEntry>();
  const waiting = new Map<string, string>();
  if (!ready) return { ready, result, waiting };
  const now = new Date();
  for (const b of bookings) {
    const item = bookingFollowItem(b, map.get(b.id) || EMPTY_MARK);
    const kind = followKind(item, now);
    if (kind) result.set(b.id, { item, kind });
    const note = kind ? null : followWaitingNote(item, now);
    if (note) waiting.set(b.id, note);
  }
  return { ready, result, waiting };
}

const FIN_TO_PAY: Record<string, FollowItem["paymentStatus"]> = {
  PAID: "paid",
  PARTIALLY_REFUNDED: "paid",
  REFUNDED: "refunded",
  VOIDED: "refunded",
  PENDING: "pending",
  AUTHORIZED: "pending",
  PARTIALLY_PAID: "pending",
};

// 紀念品：正式訂單（未出貨）及未付款草稿；以 Shopify gid 作 ref
export async function productFollowUps(orders: ProductOrderRow[]) {
  const drafts = await loadSouvenirDrafts();
  const refs = [...orders.map((o) => o.shopify_order_id), ...drafts.map((d) => d.id)];
  const { ready, map } = await loadMarks("product", refs);
  const result = new Map<string, FollowEntry>();
  const waiting = new Map<string, string>();
  if (!ready) return { ready, result, waiting };
  const now = new Date();
  const add = (ref: string, item: FollowItem) => {
    const kind = followKind(item, now);
    if (kind) result.set(ref, { item, kind });
    const note = kind ? null : followWaitingNote(item, now);
    if (note) waiting.set(ref, note);
  };
  for (const o of orders) {
    const fulfilled = (o.fulfillment_status || "").toUpperCase() === "FULFILLED";
    const item: FollowItem = {
      entity: "product",
      ref: o.shopify_order_id,
      createdAt: o.shopify_created_at,
      owner: (o.customer_name || "").trim(),
      contact: o.phone || "",
      pet: "",
      serviceDate: "",
      serviceTime: "",
      status: o.cancelled_at ? "cancelled" : fulfilled ? "completed" : "new",
      paymentStatus: FIN_TO_PAY[(o.financial_status || "").toUpperCase()] || "pending",
      amount: Number(o.total_amount || 0),
      label: (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、"),
      projectNo: (() => { const n = productOrderProjectNo(o); return n === "—" ? "" : n; })(),
      english: false,
      mark: map.get(o.shopify_order_id) || EMPTY_MARK,
    };
    add(o.shopify_order_id, item);
  }
  for (const d of drafts) {
    const mark = map.get(d.id) || EMPTY_MARK;
    const item: FollowItem = {
      entity: "product",
      ref: d.id,
      createdAt: d.createdAt,
      owner: d.owner,
      contact: d.phone,
      pet: "",
      serviceDate: "",
      serviceTime: "",
      status: "new",
      paymentStatus: "pending",
      amount: d.amount,
      label: d.itemsText,
      projectNo: d.projectNo,
      english: false,
      mark: { ...mark, paymentLink: mark.paymentLink || d.invoiceUrl || null },
    };
    add(d.id, item);
  }
  return { ready, result, waiting };
}
