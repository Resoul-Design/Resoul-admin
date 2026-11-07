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
    admin.from("logistics_orders").select("*").order("created_at", { ascending: false }),
    admin.from("company_orders").select("invoice_no, customer_name, phone, email, pet_name, project_no, order_type, status, created_at").order("created_at", { ascending: false }),
    admin.from("deposit_bookings").select("invoice_no, owner_name, contact, pet_name, project_no, status, created_at").order("created_at", { ascending: false }),
    admin.from("cremation_bookings").select("invoice_no, owner_name, contact, pet_name, case_no, source, status, created_at").order("created_at", { ascending: false }),
    admin.from("product_orders").select("invoice_no, customer_name, phone, email, project_no, status, shopify_created_at").order("shopify_created_at", { ascending: false }),
  ]);
  const data = [
    ...(logistics.data || []),
    ...(company.data || []).map((r) => ({ ...r, owner_name: r.customer_name, contact: r.phone, source: "company_order" })),
    ...(deposits.data || []).map((r) => ({ ...r, phone: r.contact, source: "deposit_booking" })),
    ...(cremations.data || []).map((r) => ({ ...r, phone: r.contact, project_no: r.case_no, source: r.source || "cremation_booking" })),
    ...(products.data || []).map((r) => ({ ...r, owner_name: r.customer_name, contact: r.phone, created_at: r.shopify_created_at, source: "product_order" })),
  ];
  const rows: LogisticsRow[] = (data as Record<string, unknown>[]).filter((row) => row.invoice_no != null).map((row) => ({
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
  return <div><h1 className="mb-5 text-2xl font-semibold">客戶資料</h1><LogisticsTable rows={rows} error={logistics.error?.message || null} /></div>;
}

