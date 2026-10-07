"use server";

import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalProjectNo, productOrderProjectNo, projectNoFromNotes } from "@/lib/order-label";

export type SearchItem = { key: string; title: string; sub: string; href: string };
export type SearchGroup = { label: string; items: SearchItem[]; more: number };

const MAX_PER_GROUP = 8;
const STATUS: Record<string, string> = {
  new: "新收到",
  contacted: "已聯絡",
  scheduled: "已排期",
  pickup: "已接送",
  cremating: "火化中",
  ready: "可取回",
  completed: "已完成",
  cancelled: "已取消",
};
const PAY: Record<string, string> = { paid: "已付款", pending: "待付款", failed: "付款失敗", refunded: "已退款" };

const join = (...bits: (string | null | undefined)[]) => bits.filter((b) => b && b !== "—").join(" · ");
const listHref = (path: string, q: string) => `${path}?q=${encodeURIComponent(q)}`;

// 文字欄位包含關鍵字，或電話數字包含查詢數字（不理 852、空格、橫線）
function makeMatcher(raw: string) {
  const text = raw.trim().toLowerCase();
  const compact = raw.replace(/[\s()+-]/g, "");
  const digits = /^\d{4,}$/.test(compact) ? compact.replace(/^852(?=\d{8}$)/, "") : "";
  return (fields: (string | null | undefined)[], phones: (string | null | undefined)[] = []) =>
    fields.some((f) => !!f && f.toLowerCase().includes(text)) ||
    (!!digits && phones.some((p) => !!p && p.replace(/\D/g, "").includes(digits)));
}

function group(label: string, items: SearchItem[]): SearchGroup | null {
  return items.length ? { label, items: items.slice(0, MAX_PER_GROUP), more: Math.max(0, items.length - MAX_PER_GROUP) } : null;
}

// 全後台搜尋：只搜尋同事有權限的類別
export async function globalSearch(query: string): Promise<SearchGroup[]> {
  const staff = await getStaff();
  const q = String(query || "").trim().slice(0, 60);
  if (!staff || q.length < 2) return [];
  const can = (key: string) => hasModule(staff, [key]);
  const match = makeMatcher(q);
  const admin = createAdminClient();

  const [deposits, bookings, orders, drafts] = await Promise.all([
    can("deposits")
      ? admin
          .from("deposit_bookings")
          .select("id, created_at, owner_name, contact, pet_name, service_date, status, payment_ref, payment_status, shopify_order_name, notes")
          .order("created_at", { ascending: false })
          .limit(1000)
      : null,
    can("bookings") || can("vet_assessments")
      ? admin
          .from("cremation_bookings")
          .select("id, created_at, case_no, owner_name, contact, pet_name, plan, service_date, status, source, payment_ref, shopify_order_name, notes")
          .order("created_at", { ascending: false })
          .limit(1000)
      : null,
    can("orders")
      ? admin
          .from("product_orders")
          .select("*")
          .order("shopify_created_at", { ascending: false })
          .limit(1000)
      : null,
    can("orders") ? loadSouvenirDrafts() : [],
  ]);

  const groups: (SearchGroup | null)[] = [];

  if (deposits?.data) {
    const items = deposits.data
      .filter((d) => match([d.owner_name, d.pet_name, d.payment_ref, d.shopify_order_name, d.notes], [d.contact]))
      .map((d) => {
        const no = projectNoFromNotes(d.notes);
        return {
          key: "d-" + d.id,
          title: join(d.owner_name || "—", d.pet_name),
          sub: join(no, d.service_date || d.created_at.slice(0, 10), STATUS[d.status] || d.status, PAY[d.payment_status || ""]),
          href: listHref("/deposits", no !== "—" ? no : d.payment_ref || d.owner_name || q),
        };
      });
    groups.push(group("接送服務", items));
  }

  if (bookings?.data) {
    const cremation: SearchItem[] = [];
    const vet: SearchItem[] = [];
    for (const b of bookings.data) {
      const no = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
      if (!match([b.owner_name, b.pet_name, no, b.case_no, b.payment_ref, b.shopify_order_name], [b.contact])) continue;
      const isVet = (b.source || "").includes("euthanasia");
      if (isVet ? !can("vet_assessments") : !can("bookings")) continue;
      const item = {
        key: "b-" + b.id,
        title: join(b.owner_name || "—", b.pet_name),
        sub: join(no, b.plan, b.service_date || b.created_at.slice(0, 10), STATUS[b.status] || b.status),
        href: listHref(isVet ? "/vet-assessments" : "/bookings", no !== "—" ? no : b.owner_name || q),
      };
      (isVet ? vet : cremation).push(item);
    }
    groups.push(group("火化預約", cremation), group("獸醫評估", vet));
  }

  if (orders?.data || drafts.length) {
    const draftItems: SearchItem[] = drafts
      .filter((d) => match([d.name, d.owner, d.projectNo, d.itemsText], [d.phone]))
      .map((d) => ({
        key: "draft-" + d.id,
        title: join(`${d.name}（草稿）`, d.owner),
        sub: join(d.projectNo, d.createdAt.slice(0, 10), "待付款"),
        href: listHref("/orders", d.name),
      }));
    const items = draftItems.concat((orders?.data || [])
      .filter((o) => {
        const lines = (o.line_items || []) as { title?: string; attributes?: { key?: string; value?: string }[] }[];
        const attrs = lines.flatMap((l) => l.attributes || []).map((a) => a.value);
        return match([o.order_name, productOrderProjectNo(o), o.customer_name, o.email, ...lines.map((l) => l.title), ...attrs], [o.phone]);
      })
      .map((o) => ({
        key: "o-" + o.shopify_order_id,
        title: join(o.order_name, o.customer_name),
        sub: join(productOrderProjectNo(o), o.shopify_created_at.slice(0, 10), o.cancelled_at ? "已取消" : o.financial_status === "PAID" ? "已付款" : o.financial_status),
        href: listHref("/orders", o.order_name),
      })));
    groups.push(group("紀念品訂單", items));
  }

  return groups.filter((g): g is SearchGroup => !!g);
}
