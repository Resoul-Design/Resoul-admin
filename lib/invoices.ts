// 發票：由後台記錄（接送訂金、火化／獸醫預約、紀念品訂單）產生，不依賴 Shopify 訂單仍然存在。
// 只限已付款並有 Shopify 訂單號（發票編號）的記錄。
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModule, type Staff } from "@/lib/auth";
import { canonicalProjectNo, productOrderProjectNo, projectNoFromNotes } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";
import { shopifyGraphQL } from "@/lib/shopify";

export type InvoiceItem = { sku: string; title: string; unit: number | null; qty: number };
export type InvoiceDoc = {
  ref: string;
  no: string;
  date: string;
  kind: string;
  issuedTo: string;
  pet: string;
  phone: string;
  email: string;
  project: string;
  paymentRef: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  isTest: boolean;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const petText = (r: Row) => [str(r.pet_name), r.pet_type ? `（${str(r.pet_type)}）` : ""].join("").trim();

const PLAN_CODE: Record<string, string> = { 風之旅: "BJ", 雲之旅: "CJ", 星之旅: "SJ" };
const BAND_NO: Record<string, string> = { "< 1 kg": "0", "1.1–5 kg": "1", "5.1–10 kg": "5", "10.1–15 kg": "10", "15.1–20 kg": "15", "20.1–30 kg": "20", "30.1–40 kg": "30", "40.1–50 kg": "40" };

function depositDoc(r: Row): InvoiceDoc | null {
  if (r.payment_status !== "paid" || !r.shopify_order_name) return null;
  const amount = num(r.payment_amount);
  return {
    ref: `deposit:${str(r.id)}`,
    no: str(r.shopify_order_name),
    // 網站預約即時付款：用預約時間（舊記錄的 paid_at 為補記日期）；後台建立的付款連結：用付款時間
    date: str(str(r.source).startsWith("web:") ? r.created_at : r.paid_at || r.created_at),
    kind: "接送訂金 Pick-up deposit",
    issuedTo: str(r.owner_name),
    pet: petText(r),
    phone: str(r.contact),
    email: "",
    project: canonicalProjectNo(str(r.project_no), projectNoFromNotes(str(r.notes))).replace("—", ""),
    paymentRef: /^PAY-/i.test(str(r.payment_ref)) ? str(r.payment_ref) : "",
    items: [{ sku: "RS-DEPOSIT", title: "預約接送訂金｜安排預約接送", unit: amount, qty: 1 }],
    subtotal: amount,
    discount: 0,
    total: amount,
    isTest: !!r.is_test,
  };
}

function bookingDoc(r: Row): InvoiceDoc | null {
  if (r.payment_status !== "paid" || !r.shopify_order_name) return null;
  const vet = str(r.source).includes("euthanasia");
  const product = (str(r.notes).match(/產品[:：]\s*([^|｜]+)/) || [])[1]?.trim() || str(r.plan) || (vet ? "上門獸醫評估" : "寵物火化服務");
  const band = (product.match(/[（(]([^)）]*kg)[)）]/) || [])[1] || "";
  const sku = PLAN_CODE[str(r.plan)] && BAND_NO[band] ? PLAN_CODE[str(r.plan)] + BAND_NO[band] : "";
  const amount = num(r.payment_amount ?? r.amount);
  return {
    ref: `booking:${str(r.id)}`,
    no: str(r.shopify_order_name),
    date: str(r.paid_at || r.created_at),
    kind: vet ? "獸醫評估 Vet assessment" : "火化服務 Cremation",
    issuedTo: str(r.owner_name),
    pet: petText(r),
    phone: str(r.contact),
    email: "",
    project: canonicalProjectNo(str(r.case_no), projectNoFromNotes(str(r.notes))).replace("—", ""),
    paymentRef: /^PAY-/i.test(str(r.payment_ref)) ? str(r.payment_ref) : "",
    items: [{ sku, title: product, unit: amount, qty: 1 }],
    subtotal: amount,
    discount: 0,
    total: amount,
    isTest: !!r.is_test,
  };
}

const PAID_ORDER = ["PAID", "PARTIALLY_REFUNDED"];
function orderDoc(o: ProductOrderRow): InvoiceDoc | null {
  if (!PAID_ORDER.includes(o.financial_status || "") || o.cancelled_at) return null;
  const total = num(o.total_amount);
  const lines = o.line_items || [];
  const items: InvoiceItem[] = lines.map((it) => ({
    sku: it.sku || "",
    title: it.title + (it.variant_title && it.variant_title !== "Default Title" ? `（${it.variant_title}）` : ""),
    unit: it.unit_price != null ? Number(it.unit_price) : lines.length === 1 ? total / (it.quantity || 1) : null,
    qty: it.quantity || 1,
  }));
  const subtotal = items.every((it) => it.unit != null) ? items.reduce((n, it) => n + (it.unit || 0) * it.qty, 0) : total;
  return {
    ref: `order:${o.shopify_order_id.split("/").pop()}`,
    no: o.order_name,
    date: o.shopify_created_at,
    kind: "紀念品 Keepsakes",
    issuedTo: o.customer_name || "",
    pet: "",
    phone: o.phone || "",
    email: o.email || "",
    project: productOrderProjectNo(o).replace("—", ""),
    paymentRef: "",
    items,
    subtotal,
    discount: Math.max(0, subtotal - total),
    total,
    isTest: !!o.is_test,
  };
}

export type InvoiceQuery = { refs?: string[]; from?: string; to?: string; kinds?: string[] };

// 讀取發票：指定記錄（refs，例如 deposit:<id>），或按付款日期範圍（只限正式記錄）；按員工權限過濾
export async function loadInvoices(q: InvoiceQuery, staff: Staff): Promise<InvoiceDoc[]> {
  const admin = createAdminClient();
  const can = { deposit: hasModule(staff, ["deposits"]), cremation: hasModule(staff, ["bookings"]), vet: hasModule(staff, ["vet_assessments"]), order: hasModule(staff, ["orders"]) };
  const docs: InvoiceDoc[] = [];
  const bookingAllowed = (r: Row) => (str(r.source).includes("euthanasia") ? can.vet : can.cremation);

  if (q.refs?.length) {
    const ids = { deposit: [] as string[], booking: [] as string[], order: [] as string[] };
    for (const ref of q.refs.slice(0, 200)) {
      const [type, id] = ref.split(":");
      if (id && (type === "deposit" || type === "booking" || type === "order")) ids[type].push(type === "order" ? `gid://shopify/Order/${id}` : id);
    }
    const [d, b, o] = await Promise.all([
      ids.deposit.length && can.deposit ? admin.from("deposit_bookings").select("*").in("id", ids.deposit) : null,
      ids.booking.length && (can.cremation || can.vet) ? admin.from("cremation_bookings").select("*").in("id", ids.booking) : null,
      ids.order.length && can.order ? admin.from("product_orders").select("*").in("shopify_order_id", ids.order) : null,
    ]);
    for (const r of (d?.data || []) as Row[]) { const doc = depositDoc(r); if (doc) docs.push(doc); }
    for (const r of (b?.data || []) as Row[]) { const doc = bookingAllowed(r) ? bookingDoc(r) : null; if (doc) docs.push(doc); }
    for (const r of (o?.data || []) as ProductOrderRow[]) { const doc = orderDoc(r); if (doc) docs.push(doc); }
  } else if (q.from && q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.from) && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
    const kinds = new Set(q.kinds?.length ? q.kinds : ["deposit", "cremation", "order"]);
    // 香港日期 → UTC 時間範圍
    const start = new Date(`${q.from}T00:00:00+08:00`).toISOString();
    const end = new Date(`${q.to}T23:59:59.999+08:00`).toISOString();
    const [d, b, o] = await Promise.all([
      kinds.has("deposit") && can.deposit
        ? admin.from("deposit_bookings").select("*").eq("payment_status", "paid").eq("is_test", false).gte("paid_at", start).lte("paid_at", end).limit(500)
        : null,
      (kinds.has("cremation") && can.cremation) || (kinds.has("vet") && can.vet)
        ? admin.from("cremation_bookings").select("*").eq("payment_status", "paid").eq("is_test", false).gte("paid_at", start).lte("paid_at", end).limit(500)
        : null,
      kinds.has("order") && can.order
        ? admin.from("product_orders").select("*").eq("is_test", false).gte("shopify_created_at", start).lte("shopify_created_at", end).limit(500)
        : null,
    ]);
    for (const r of (d?.data || []) as Row[]) { const doc = depositDoc(r); if (doc) docs.push(doc); }
    for (const r of (b?.data || []) as Row[]) {
      const vet = str(r.source).includes("euthanasia");
      if (!(vet ? kinds.has("vet") && can.vet : kinds.has("cremation") && can.cremation)) continue;
      const doc = bookingDoc(r);
      if (doc) docs.push(doc);
    }
    for (const r of (o?.data || []) as ProductOrderRow[]) { const doc = orderDoc(r); if (doc) docs.push(doc); }
  }
  await fillMissingSkus(docs);
  // 按發票編號排序（#RS-1001、#RS-1002…）
  return docs.sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }));
}

// 舊紀念品訂單未保存產品代碼：按產品名稱向 Shopify 查詢（只限單一款式的產品；查詢失敗略過）
async function fillMissingSkus(docs: InvoiceDoc[]) {
  const titles = [...new Set(docs.flatMap((d) => d.items.filter((it) => !it.sku && d.ref.startsWith("order:")).map((it) => it.title)))].slice(0, 20);
  const found = new Map<string, string>();
  await Promise.all(
    titles.map(async (title) => {
      try {
        const res = await shopifyGraphQL<{ products: { nodes: { title: string; variants: { nodes: { sku: string | null }[] } }[] } }>(
          `query($q: String!) { products(first: 3, query: $q) { nodes { title variants(first: 2) { nodes { sku } } } } }`,
          { q: `title:${JSON.stringify(title)}` }
        );
        const p = res.products.nodes.find((n) => n.title === title);
        if (p && p.variants.nodes.length === 1 && p.variants.nodes[0].sku) found.set(title, p.variants.nodes[0].sku);
      } catch {}
    })
  );
  for (const d of docs) for (const it of d.items) if (!it.sku && found.has(it.title)) it.sku = found.get(it.title)!;
}
