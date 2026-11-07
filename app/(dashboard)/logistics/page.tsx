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
  const logistics = await createAdminClient().from("logistics_orders").select("*").order("invoice_no", { ascending: false }).order("created_at", { ascending: false });
  const data = logistics.data || [];
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

