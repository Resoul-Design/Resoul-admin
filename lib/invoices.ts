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
  shopifyOrderId?: string; // 只供讀取 Shopify 訂單備註
  companyNo?: boolean; // 發票編號已是公司單號（舊單才會改讀 Shopify 備註的單據編號）
  remarks?: string[]; // Shopify 訂單備註及附加資料（與 Order Printer 範本相同）；未讀到 Shopify 時沿用後台資料
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
    no: r.invoice_no ? String(r.invoice_no) : str(r.shopify_order_name),
    companyNo: !!r.invoice_no,
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
    shopifyOrderId: str(r.shopify_order_id),
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
    no: r.invoice_no ? String(r.invoice_no) : str(r.shopify_order_name),
    companyNo: !!r.invoice_no,
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
    discount: Math.min(amount, num(r.deposit_credit)),
    total: amount - Math.min(amount, num(r.deposit_credit)),
    isTest: !!r.is_test,
    shopifyOrderId: str(r.shopify_order_id),
  };
}

// 開新單（紀念品、其他）：由開單記錄產生，毋須等 Shopify 訂單同步到紀念品訂單表
const COMPANY_KIND: Record<string, string> = { product: "紀念品 Keepsakes", other: "其他 Other", cremation: "火化服務 Cremation", vet: "獸醫評估 Vet assessment", deposit: "接送訂金 Pick-up deposit" };
function companyDoc(r: Row): InvoiceDoc | null {
  if (r.status !== "paid" || !r.invoice_no) return null;
  const d = (r.details || {}) as { lines?: { label: string; price?: number | null; quantity?: number }[]; depositCredit?: { amount?: number } | null };
  const items = (d.lines || []).map((l) => ({ sku: "", title: l.label, unit: l.price ?? null, qty: l.quantity || 1 }));
  const subtotal = items.length && items.every((it) => it.unit != null) ? items.reduce((n, it) => n + (it.unit || 0) * it.qty, 0) : num(r.amount);
  const discount = Math.min(subtotal, num(d.depositCredit?.amount));
  return {
    ref: `company:${str(r.id)}`,
    no: String(r.invoice_no),
    companyNo: true,
    date: str(r.updated_at || r.created_at),
    kind: COMPANY_KIND[str(r.order_type)] || "其他 Other",
    issuedTo: str(r.customer_name),
    pet: str(r.pet_name),
    phone: str(r.phone),
    email: str(r.email),
    project: str(r.project_no),
    paymentRef: /^PAY-/i.test(str(r.payment_ref)) ? str(r.payment_ref) : "",
    items,
    subtotal,
    discount,
    total: subtotal - discount,
    isTest: false,
    shopifyOrderId: str(r.shopify_order_id) || undefined,
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
    no: o.invoice_no ? String(o.invoice_no) : o.order_name,
    companyNo: !!o.invoice_no,
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
    shopifyOrderId: o.shopify_order_id,
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
    const ids = { deposit: [] as string[], booking: [] as string[], order: [] as string[], company: [] as string[] };
    for (const ref of q.refs.slice(0, 200)) {
      const [type, id] = ref.split(":");
      if (id && (type === "deposit" || type === "booking" || type === "order" || type === "company")) ids[type].push(type === "order" ? `gid://shopify/Order/${id}` : id);
    }
    const [d, b, o, c] = await Promise.all([
      ids.deposit.length && can.deposit ? admin.from("deposit_bookings").select("*").in("id", ids.deposit) : null,
      ids.booking.length && (can.cremation || can.vet) ? admin.from("cremation_bookings").select("*").in("id", ids.booking) : null,
      ids.order.length && can.order ? admin.from("product_orders").select("*").in("shopify_order_id", ids.order) : null,
      ids.company.length && can.order ? admin.from("company_orders").select("*").in("id", ids.company.filter((x) => /^[0-9a-f-]{36}$/i.test(x))).is("linked_id", null) : null,
    ]);
    for (const r of (d?.data || []) as Row[]) { const doc = depositDoc(r); if (doc) docs.push(doc); }
    for (const r of (b?.data || []) as Row[]) { const doc = bookingAllowed(r) ? bookingDoc(r) : null; if (doc) docs.push(doc); }
    for (const r of (o?.data || []) as ProductOrderRow[]) { const doc = orderDoc(r); if (doc) docs.push(doc); }
    for (const r of (c?.data || []) as Row[]) { const doc = companyDoc(r); if (doc) docs.push(doc); }
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
  await Promise.all([fillMissingSkus(docs), applyOrderExtras(docs)]);
  // 按發票編號排序（#RS-1001、#RS-1002…）
  return docs.sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }));
}

// 由 Shopify 訂單備註（一行「Invoice No.：xxx」或「單據編號：xxx」、「寵物：xxx」）或訂單欄位讀取客人指定的單據編號及寵物名稱
export function parseOrderExtras(note: string | null | undefined, attrs: { key: string; value: string | null }[] = []) {
  const attr = (...keys: string[]) => attrs.find((a) => keys.includes(a.key) && a.value?.trim())?.value?.trim() || "";
  const line = (label: RegExp) => {
    for (const raw of String(note || "").split(/\r?\n/)) {
      const m = raw.trim().match(/^([^:：]+)[:：](.*)$/);
      if (m && label.test(m[1].trim())) return m[2].trim();
    }
    return "";
  };
  return {
    invoiceNo: attr("Invoice No", "Invoice No.", "單據編號") || line(/^(單據編號|發票編號|invoice no\.?|invoice number)$/i),
    pet: attr("Owner of", "毛孩名", "Pet", "pet") || line(/^寵物$/),
  };
}

// Order Printer 範本不放入 Remarks 的附加資料（內部欄位、寵物、單號、訂金）
const HIDDEN_ATTRS = new Set(["Deposit", "訂金", "deposit", "Owner of", "毛孩名", "Pet", "pet", "Invoice No", "Invoice No.", "單據編號", "payment_ref", "booking_ref", "Owner", "Phone", "Order Type", "referrer_phone", "Original Project No", "Booking source", "project_no", "Project No", "Deposit credit"]);
export function orderRemarks(note: string | null | undefined, attrs: { key: string; value: string | null }[] = []): string[] {
  const lines = String(note || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => {
    if (!l) return false;
    const label = (l.replace("：", ":").split(":")[0] || "").trim().toLowerCase();
    return !l.replace("：", ":").includes(":") || !["寵物", "單據編號", "發票編號", "invoice no.", "invoice no", "invoice number"].includes(label);
  });
  return [...lines, ...attrs.filter((a) => a.value?.trim() && !HIDDEN_ATTRS.has(a.key)).map((a) => `${a.key}: ${a.value}`)];
}

// 與 Shopify 發票範本一致；讀取失敗或訂單已刪除時沿用後台資料
async function applyOrderExtras(docs: InvoiceDoc[]) {
  const gid = (id?: string) => (!id ? "" : id.startsWith("gid://") ? id : /^\d+$/.test(id) ? `gid://shopify/Order/${id}` : "");
  const ids = [...new Set(docs.map((d) => gid(d.shopifyOrderId)).filter(Boolean))];
  type ShopifyLine = { title: string; variantTitle: string | null; sku: string | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } | null };
  const found = new Map<string, ReturnType<typeof parseOrderExtras>>();
  const remarks = new Map<string, string[]>();
  const lines = new Map<string, ShopifyLine[]>();
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const res = await shopifyGraphQL<{ nodes: ({ id: string; note: string | null; customAttributes: { key: string; value: string | null }[]; lineItems?: { nodes: ShopifyLine[] } } | null)[] }>(
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id note customAttributes { key value } lineItems(first: 50) { nodes { title variantTitle sku quantity originalUnitPriceSet { shopMoney { amount } } } } } } }`,
        { ids: ids.slice(i, i + 100) }
      );
      for (const n of res.nodes) {
        if (!n?.id) continue;
        found.set(n.id, parseOrderExtras(n.note, n.customAttributes));
        remarks.set(n.id, orderRemarks(n.note, n.customAttributes));
        if (n.lineItems?.nodes.length) lines.set(n.id, n.lineItems.nodes);
      }
    } catch (e) {
      console.error("[invoice_extras]", e instanceof Error ? e.message : "unknown");
    }
  }
  for (const d of docs) {
    // 接送訂金、火化／安樂在家：後台記錄只存總額，項目以 Shopify 訂單為準（例如告別套餐＋加購紀念品）
    const items = lines.get(gid(d.shopifyOrderId));
    if (items && (d.ref.startsWith("deposit:") || d.ref.startsWith("booking:"))) {
      d.items = items.map((it) => ({
        sku: it.sku || "",
        title: `${it.title}${it.variantTitle && it.variantTitle !== "Default Title" ? `（${it.variantTitle}）` : ""}`,
        unit: it.originalUnitPriceSet ? Number(it.originalUnitPriceSet.shopMoney.amount) : null,
        qty: it.quantity,
      }));
      if (d.items.every((it) => it.unit != null)) {
        d.subtotal = d.items.reduce((n, it) => n + (it.unit || 0) * it.qty, 0);
        d.discount = Math.max(0, d.subtotal - d.total);
      }
    }
    const r = remarks.get(gid(d.shopifyOrderId));
    if (r) d.remarks = r;
    const extra = found.get(gid(d.shopifyOrderId));
    if (!extra) continue;
    if (extra.invoiceNo && !d.companyNo) d.no = extra.invoiceNo;
    if (extra.pet && !d.pet) d.pet = extra.pet;
  }
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
