"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";
import { updateServiceRecord, type RecordKind, type RecordValues } from "./_record-actions";

// 保存客戶資料（Excel 欄位）：只更新表格內有的欄位；此單號未有客戶資料時建立一筆（來源：後台）。
export async function updateCustomerData(invoice: string, values: Record<string, string>): Promise<{ error?: string; warning?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return { error: "沒有權限。" };
  const invoiceNo = Number(invoice);
  if (!Number.isInteger(invoiceNo) || invoiceNo < 1) return { error: "單號無效。" };

  const row: Record<string, string | number | null> = {};
  for (const field of LOGISTICS_FIELDS) {
    if (!(field.key in values)) continue;
    if (field.adminOnly && staff.role !== "admin") continue;
    if (field.hidden) continue; // 表格不顯示的欄位不在此修改（保留原有資料）
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
  if (existing && !Object.keys(row).length) return {}; // 沒有修改：不寫入
  const write = (r: typeof row) => existing
    ? admin.from("logistics_orders").update({ ...r, updated_at: new Date().toISOString() }).eq("invoice_no", invoiceNo)
    : admin.from("logistics_orders").insert({ invoice_no: invoiceNo, source: "admin", ...r });
  let { error } = await write(row);
  let urnWarning = "";
  if (error && "urn_cost" in row && /urn_cost/.test(error.message)) {
    const rest = { ...row };
    delete rest.urn_cost;
    ({ error } = await write(rest));
    urnWarning = "骨灰龕成本未能保存：請先於 Supabase 執行 db/migration_20261111_urn_cost.sql。";
  }
  if (error) {
    console.error("[logistics_update]", error.message);
    return { error: "未能保存，請稍後再試。" };
  }
  await logAudit("update_customer_data", "logistics_orders", String(invoiceNo), `${existing ? "更新" : "建立"}客戶資料：${Object.keys(row).filter((k) => row[k] != null).join("、") || "—"}`);
  // 同步到同一單號的接送／火化／開新單記錄及 Shopify（只限主人、電話、電郵、寵物名稱、動物類型）
  const warnings = await syncServiceRecords(invoiceNo, row);
  revalidatePath(`/logistics/${invoiceNo}`);
  revalidatePath("/logistics");
  if (urnWarning) warnings.push(urnWarning);
  return warnings.length ? { warning: warnings.join(" ") } : {};
}

async function syncServiceRecords(invoiceNo: number, row: Record<string, string | number | null>): Promise<string[]> {
  const touched = ["owner_name", "phone", "email", "pet_name", "animal"].some((k) => k in row);
  if (!touched) return [];
  const admin = createAdminClient();
  const [dep, cre, co] = await Promise.all([
    admin.from("deposit_bookings").select("id, owner_name, contact, pet_name, pet_type, service_date, service_time, pickup_address, notes").eq("invoice_no", invoiceNo),
    admin.from("cremation_bookings").select("id, owner_name, contact, pet_name, pet_type, service_date, service_time, pickup_address, notes").eq("invoice_no", invoiceNo),
    admin.from("company_orders").select("id, customer_name, phone, email, pet_name, linked_id").eq("invoice_no", invoiceNo).is("linked_id", null),
  ]);
  const pick = (key: string, current: unknown) => (key in row ? String(row[key] ?? "") : String(current ?? ""));
  const jobs: { kind: RecordKind; id: string; values: RecordValues }[] = [];
  for (const [kind, rows] of [["deposit", dep.data], ["cremation", cre.data]] as const) {
    for (const r of rows || []) {
      jobs.push({ kind, id: r.id, values: {
        owner_name: pick("owner_name", r.owner_name), contact: pick("phone", r.contact), pet_name: pick("pet_name", r.pet_name), pet_type: pick("animal", r.pet_type),
        service_date: String(r.service_date ?? ""), service_time: String(r.service_time ?? ""), pickup_address: String(r.pickup_address ?? ""), notes: String(r.notes ?? ""),
      } });
    }
  }
  for (const r of co.data || []) jobs.push({ kind: "company", id: r.id, values: { owner_name: pick("owner_name", r.customer_name), contact: pick("phone", r.phone), email: pick("email", r.email), pet_name: pick("pet_name", r.pet_name) } });
  const warnings: string[] = [];
  for (const j of jobs) {
    const res = await updateServiceRecord(j.kind, j.id, j.values);
    if (res.error) warnings.push(`服務記錄未能同步：${res.error}`);
    else if (res.warning) warnings.push(res.warning);
  }
  return [...new Set(warnings)];
}
