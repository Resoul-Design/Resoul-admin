import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import { LogisticsTable, type LogisticsRow } from "./_table";
import { bookingChip, companyChip, productChip, type StatusChip } from "@/lib/service-status";
import { memorialClass, memorialLabel, slowestStatus } from "@/lib/memorial-status";
import { extraOrders } from "@/lib/logistics-extra";

export const dynamic = "force-dynamic";

// 時間顯示為香港時間（例如 2026-11-08 19:56）
function hkTime(v: string) {
  const d = new Date(v);
  return !v || Number.isNaN(d.getTime()) ? v : new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}
function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

// Excel 舊單的行狀態對應中文
const ROW_STATUS: Record<string, string> = { completed: "已完成", processing: "處理中", "appointment made": "已預約", "to collect urn": "待取骨灰", "rental storage owner": "寄存中", "to delivery memorial products": "待交付紀念品" };
const rowStatusChip = (v: unknown): StatusChip | null => {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const label = ROW_STATUS[raw.toLowerCase()] || raw;
  return { label, className: label === "已完成" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800" };
};

export default async function LogisticsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["inventory"])) notFound();
  const admin = createAdminClient();
  const [logistics, company, deposits, cremations, products, productLines] = await Promise.all([
    admin.from("logistics_orders").select("*").order("invoice_no", { ascending: false }).order("created_at", { ascending: false }),
    admin.from("company_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("deposit_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("cremation_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(500),
    // 紀念品產品列（表格未建立時為空）
    admin.from("memorial_product_lines").select("invoice_no, status, source_ref").limit(5000),
  ]);
  // 每個單號的各服務單狀態（測試記錄不計）
  type Chips = { pickup: StatusChip[]; service: StatusChip[]; memorial: StatusChip[] };
  const chips = new Map<string, Chips>();
  const chipsOf = (no: unknown) => { const key = String(no); let c = chips.get(key); if (!c) { c = { pickup: [], service: [], memorial: [] }; chips.set(key, c); } return c; };
  for (const r of deposits.data || []) if (r.invoice_no != null && !r.is_test) chipsOf(r.invoice_no).pickup.push(bookingChip(r));
  for (const r of cremations.data || []) if (r.invoice_no != null && !r.is_test) chipsOf(r.invoice_no).service.push({ ...bookingChip(r), label: `${String(r.source || "").includes("euthanasia") ? "獸醫" : "火化"}・${bookingChip(r).label}` });
  const orderIds = new Set((products.data || []).map((o) => o.shopify_order_id));
  for (const o of products.data || []) if (o.invoice_no != null && !o.is_test) chipsOf(o.invoice_no).memorial.push(productChip(o));
  for (const c of company.data || []) if (c.invoice_no != null && !c.linked_id && !(c.shopify_order_id && orderIds.has(c.shopify_order_id))) chipsOf(c.invoice_no).memorial.push(companyChip(c));
  // 舊單（Excel）：火化及紀念品狀態讀 Excel 資料
  const linesByInvoice = new Map<string, string[]>();
  for (const l of productLines.data || []) { if (String(l.source_ref || "").startsWith("gid://")) continue; const key = String(l.invoice_no); linesByInvoice.set(key, [...(linesByInvoice.get(key) || []), String(l.status)]); }
  for (const [no, list] of linesByInvoice) {
    const c = chipsOf(no);
    if (c.memorial.length) continue;
    const label = memorialLabel(slowestStatus(list) || list[0]);
    c.memorial.push({ label: `${list.length} 項・${label}`, className: memorialClass(label) });
  }
  for (const r of logistics.data || []) {
    const c = chipsOf(r.invoice_no);
    if (!c.service.length && r.package_name && !/^(n\/?a|")$/i.test(String(r.package_name).trim())) { const chip = rowStatusChip(r.row_status); if (chip) c.service.push({ ...chip, label: `${r.package_name}・${chip.label}` }); }
    if (!c.memorial.length && Number(r.memorial_addon_price) > 0) c.memorial.push({ label: "有紀念品", className: "bg-gray-200 text-gray-700" });
  }
  const allRows = [
    ...(logistics.data || []),
    ...(company.data || []),
    ...(deposits.data || []),
    ...(cremations.data || []),
    ...(products.data || []),
  ] as Record<string, unknown>[];
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of allRows) {
    const invoice = text(row, "invoice_no", "invoice", "order_no");
    if (!invoice) continue;
    const previous = merged.get(invoice) || {};
    const combined = { ...previous };
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined && String(value).trim() && (!combined[key] || !String(combined[key]).trim())) combined[key] = value;
    }
    combined.invoice_no = invoice;
    merged.set(invoice, combined);
  }
  const data = [...merged.values()].sort((a, b) => Number(b.invoice_no) - Number(a.invoice_no));
  const rows: LogisticsRow[] = data.map((row) => ({
    invoiceNo: text(row, "invoice_no", "invoice", "order_no") || "—",
    owner: text(row, "owner_name", "owner", "customer_name", "name"),
    phone: text(row, "phone", "contact", "customer_phone"),
    email: text(row, "email", "customer_email"),
    project: text(row, "project_no", "project", "case_no"),
    pet: text(row, "pet_name", "pet", "animal_name"),
    plan: text(row, "plan", "package", "product_name"),
    arrival: text(row, "arrival_at", "arrival_date", "received_at", "eta"),
    deposit: text(row, "deposit", "deposit_amount"),
    balance: text(row, "balance", "balance_amount", "remaining"),
    status: text(row, "status", "logistics_status") || "—",
    updated: hkTime(text(row, "updated_at", "synced_at", "created_at")),
    extraRefs: extraOrders(row).map((x) => x.ref),
    pickupChips: chips.get(String(row.invoice_no))?.pickup || [],
    serviceChips: chips.get(String(row.invoice_no))?.service || [],
    memorialChips: chips.get(String(row.invoice_no))?.memorial || [],
  }));
  const errors = [logistics, company, deposits, cremations, products].map((result) => result.error?.message).filter(Boolean);
  return <div><h1 className="mb-5 text-2xl font-semibold">客戶資料</h1><LogisticsTable rows={rows} error={errors.length ? errors.join("；") : null} /></div>;
}