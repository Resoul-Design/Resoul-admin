import { NextResponse } from "next/server";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { templateCsv } from "@/lib/logistics-import";
import { isMemorialTracking } from "@/lib/memorial-import";
import { applyLogistics, applyMemorial, prepareLogistics, reviewLogistics, reviewMemorial, type Approved } from "@/lib/excel-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_READY = "未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。";

// 下載匯入範本（單號＋全部欄位中文名稱）
export async function GET() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(templateCsv(staff.role === "admin"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="logistics-template.csv"; filename*=UTF-8''${encodeURIComponent("客戶資料匯入範本.csv")}`, "Cache-Control": "no-store" },
  });
}

// 由 Excel 匯入（兩步）：mode=preview 只列出與後台不同之處；mode=apply 只寫入同事核准的項目及欄位
export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "請上傳 CSV 檔。" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "檔案太大（上限 5MB）。" }, { status: 400 });
  const csv = await file.text();
  const mode = String(form.get("mode") || "preview");
  let approved: Approved = {};
  if (mode === "apply") {
    try { approved = JSON.parse(String(form.get("approved") || "{}")); } catch { return NextResponse.json({ error: "核准資料無效，請重新預覽。" }, { status: 400 }); }
  }
  const admin = createAdminClient();
  const who = staff.name || staff.email;

  try {
    if (isMemorialTracking(csv)) {
      if (mode !== "apply") return NextResponse.json(await reviewMemorial(csv, admin));
      const res = await applyMemorial(csv, approved, admin, who);
      await logAudit("import_memorial_csv", "memorial_product_lines", null, `紀念品 Excel 核准寫入：新增 ${res.added}、更新 ${res.updated}${res.errors.length ? `、${res.errors.length} 項提示` : ""}`);
      return NextResponse.json({ done: true, kind: "memorial", ...res });
    }
    const plan = await prepareLogistics(csv, staff.role === "admin", admin);
    if (mode !== "apply") return NextResponse.json(await reviewLogistics(plan, admin));
    const res = await applyLogistics(plan, approved, admin);
    await logAudit("import_logistics_csv", "logistics_orders", null, `客戶資料 Excel 核准寫入：更新 ${res.updated}、新增 ${res.created}${res.extras ? `、附加單 ${res.extras}` : ""}${res.errors.length ? `、${res.errors.length} 項提示` : ""}`);
    return NextResponse.json({ done: true, kind: "logistics", ...res });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_READY") return NextResponse.json({ error: NOT_READY }, { status: 400 });
    console.error("[excel_sync]", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "未能處理此 CSV，請稍後再試。" }, { status: 500 });
  }
}
