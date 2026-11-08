"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";

// 保存客戶資料（Excel 欄位）：只更新表格內有的欄位；此單號未有客戶資料時建立一筆（來源：後台）。
export async function updateCustomerData(invoice: string, values: Record<string, string>): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return { error: "沒有權限。" };
  const invoiceNo = Number(invoice);
  if (!Number.isInteger(invoiceNo) || invoiceNo < 1) return { error: "單號無效。" };

  const row: Record<string, string | number | null> = {};
  for (const field of LOGISTICS_FIELDS) {
    if (!(field.key in values)) continue;
    if (field.adminOnly && staff.role !== "admin") continue;
    const raw = String(values[field.key] ?? "").trim().slice(0, field.type === "textarea" ? 2000 : 300);
    if (!raw) { row[field.key] = null; continue; }
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: `「${field.label}」日期格式不正確。` };
    if (field.type === "number") {
      const n = Number(raw.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || Math.abs(n) > 99_999_999) return { error: `「${field.label}」請輸入數字。` };
      row[field.key] = n;
      continue;
    }
    if (field.type === "url" && !/^https?:\/\//i.test(raw)) return { error: `「${field.label}」請輸入完整網址（https://…）。` };
    row[field.key] = raw;
  }
  if (typeof row.phone === "string" && !/^[+\d\s()-]{8,20}$/.test(row.phone)) return { error: "電話格式不正確。" };
  if (typeof row.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return { error: "電郵格式不正確。" };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("logistics_orders").select("invoice_no").eq("invoice_no", invoiceNo).maybeSingle();
  const { error } = existing
    ? await admin.from("logistics_orders").update({ ...row, updated_at: new Date().toISOString() }).eq("invoice_no", invoiceNo)
    : await admin.from("logistics_orders").insert({ invoice_no: invoiceNo, source: "admin", ...row });
  if (error) {
    console.error("[logistics_update]", error.message);
    return { error: "未能保存，請稍後再試。" };
  }
  await logAudit("update_customer_data", "logistics_orders", String(invoiceNo), `${existing ? "更新" : "建立"}客戶資料：${Object.keys(row).filter((k) => row[k] != null).join("、") || "—"}`);
  revalidatePath(`/logistics/${invoiceNo}`);
  revalidatePath("/logistics");
  return {};
}
