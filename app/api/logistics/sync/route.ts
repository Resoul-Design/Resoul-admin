import { NextResponse } from "next/server";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { planImport, templateCsv } from "@/lib/logistics-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 下載匯入範本（單號＋全部欄位中文名稱）
export async function GET() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(templateCsv(staff.role === "admin"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="logistics-template.csv"; filename*=UTF-8''${encodeURIComponent("客戶資料匯入範本.csv")}`, "Cache-Control": "no-store" },
  });
}

// 匯入客戶資料 CSV：空白格不覆蓋現有資料；只更新 CSV 內有填的欄位；未有的單號建立新記錄
export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "請上傳 CSV 檔。" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "檔案太大（上限 5MB）。" }, { status: 400 });
  const plan = planImport(await file.text(), { isAdmin: staff.role === "admin" });
  if (!plan.rows.length) return NextResponse.json({ updated: 0, created: 0, errors: plan.errors, unknownColumns: plan.unknownColumns });

  const admin = createAdminClient();
  const ids = [...new Set(plan.rows.map((r) => r.invoiceNo))];
  const existing = new Set<number>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin.from("logistics_orders").select("invoice_no").in("invoice_no", ids.slice(i, i + 500));
    for (const r of data || []) existing.add(Number(r.invoice_no));
  }
  const errors = [...plan.errors];
  let updated = 0, created = 0;
  // 逐行寫入：只寫 CSV 有填的欄位（批量寫入會把未提供的欄位變成空白，故不用）
  for (const r of plan.rows) {
    const now = new Date().toISOString();
    const { error } = existing.has(r.invoiceNo)
      ? await admin.from("logistics_orders").update({ ...r.values, updated_at: now }).eq("invoice_no", r.invoiceNo)
      : await admin.from("logistics_orders").insert({ invoice_no: r.invoiceNo, source: "csv", ...r.values });
    if (error) errors.push(`第 ${r.line} 行（單號 ${r.invoiceNo}）：未能保存（${error.message.slice(0, 80)}）`);
    else if (existing.has(r.invoiceNo)) updated++;
    else { created++; existing.add(r.invoiceNo); }
  }
  await logAudit("import_logistics_csv", "logistics_orders", null, `CSV 匯入：更新 ${updated}、新增 ${created}${errors.length ? `、${errors.length} 項提示` : ""}`);
  return NextResponse.json({ updated, created, errors, unknownColumns: plan.unknownColumns });
}
