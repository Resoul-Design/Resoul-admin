import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import { LogisticsTable, type LogisticsRow } from "./_table";
import { invoiceLogisticsStatus } from "@/lib/logistics-status";
import { extraOrders } from "@/lib/logistics-extra";
import { referralFee } from "@/lib/logistics-calc";
import { loadPriceSettings } from "@/lib/price-settings";

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

export default async function LogisticsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["inventory"])) notFound();
  const admin = createAdminClient();
  const prices = await loadPriceSettings();
  const [logistics, company, deposits, cremations, products, productLines] = await Promise.all([
    admin.from("logistics_orders").select("*").order("invoice_no", { ascending: false }).order("created_at", { ascending: false }),
    admin.from("company_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("deposit_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("cremation_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(500),
    // 紀念品產品列（表格未建立時為空）
    admin.from("memorial_product_lines").select("invoice_no, status, source_ref").limit(5000),
  ]);
  // 每個單號一個狀態（logistics Excel 常用狀態）
  const group = <T extends Record<string, unknown>>(list: T[] | null) => { const m = new Map<string, T[]>(); for (const r of list || []) if (r.invoice_no != null) m.set(String(r.invoice_no), [...(m.get(String(r.invoice_no)) || []), r]); return m; };
  const depBy = group(deposits.data), creBy = group(cremations.data), coBy = group((company.data || []).filter((c) => !c.linked_id)), proBy = group(products.data);
  const lineBy = new Map<string, string[]>();
  for (const l of productLines.data || []) lineBy.set(String(l.invoice_no), [...(lineBy.get(String(l.invoice_no)) || []), String(l.status)]);
  const rowStatus = new Map((logistics.data || []).map((r) => [String(r.invoice_no), String(r.row_status || "")]));
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
    referral: referralFee(row.referral, row.package_price, row.package_code, prices.partners),
    state: invoiceLogisticsStatus({ rowStatus: rowStatus.get(String(row.invoice_no)), deposits: depBy.get(String(row.invoice_no)) || [], cremations: creBy.get(String(row.invoice_no)) || [], company: coBy.get(String(row.invoice_no)) || [], products: proBy.get(String(row.invoice_no)) || [], memorialStatuses: lineBy.get(String(row.invoice_no)) || [] }),
  }));
  const errors = [logistics, company, deposits, cremations, products].map((result) => result.error?.message).filter(Boolean);
  return <div><h1 className="mb-5 text-2xl font-semibold">客戶資料</h1><LogisticsTable rows={rows} error={errors.length ? errors.join("；") : null} /></div>;
}