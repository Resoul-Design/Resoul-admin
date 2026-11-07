import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import { LogisticsTable, type LogisticsRow } from "./_table";

export const dynamic = "force-dynamic";

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
  const [logistics, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").order("invoice_no", { ascending: false }).order("created_at", { ascending: false }),
    admin.from("company_orders").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("deposit_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("cremation_bookings").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(500),
  ]);
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
    updated: text(row, "updated_at", "synced_at", "created_at"),
    raw: row,
  }));
  const errors = [logistics, company, deposits, cremations, products].map((result) => result.error?.message).filter(Boolean);
  return <div><h1 className="mb-5 text-2xl font-semibold">客戶資料</h1><LogisticsTable rows={rows} error={errors.length ? errors.join("；") : null} /></div>;
}