import { NextResponse } from "next/server";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { planImport, templateCsv } from "@/lib/logistics-import";
import { extraOrders, type ExtraOrder } from "@/lib/logistics-extra";
import { loadPriceSettings } from "@/lib/price-settings";
import { urnCost } from "@/lib/urn-costs";
import { isMemorialTracking, planMemorialImport } from "@/lib/memorial-import";

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
  const csv = await file.text();
  // Excel「Memorial Product Order Tracking」：寫入紀念品產品行（只加入未有的行）
  if (isMemorialTracking(csv)) {
    const mp = planMemorialImport(csv);
    const admin = createAdminClient();
    const invoices = [...new Set(mp.rows.map((r) => r.invoiceNo))];
    const have = new Map<string, number>();
    for (let i = 0; i < invoices.length; i += 300) {
      const { data, error } = await admin.from("memorial_product_lines").select("invoice_no, product_code, product_name").in("invoice_no", invoices.slice(i, i + 300));
      if (error) return NextResponse.json({ error: "未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。" }, { status: 400 });
      for (const r of data || []) { const k = `${r.invoice_no}|${String(r.product_code || r.product_name).toUpperCase()}`; have.set(k, (have.get(k) || 0) + 1); }
    }
    const who = staff.name || staff.email;
    const inserts = mp.rows.filter((r) => { const [k, n] = r.key.split("#"); return (have.get(k) || 0) < Number(n); }).map((r) => ({
      ...r.values, invoice_no: r.invoiceNo, extra_ref: r.extraRef, source: "excel", sync_status: "none", sort_order: Number(r.key.split("#")[1]), created_by: `Excel 匯入（${who}）`,
    }));
    const errors = [...mp.errors];
    let added = 0;
    for (let i = 0; i < inserts.length; i += 200) {
      const batch = inserts.slice(i, i + 200);
      const { error } = await admin.from("memorial_product_lines").insert(batch);
      if (error) errors.push(`第 ${i + 1}–${i + batch.length} 件未能保存（${error.message.slice(0, 80)}）`);
      else added += batch.length;
    }
    await logAudit("import_memorial_csv", "memorial_product_lines", null, `紀念品 CSV 匯入：新增 ${added} 行、已有略過 ${mp.rows.length - inserts.length} 行${errors.length ? `、${errors.length} 項提示` : ""}`);
    return NextResponse.json({ memorialAdded: added, memorialSkipped: mp.rows.length - inserts.length, errors });
  }
  const plan = planImport(csv, { isAdmin: staff.role === "admin" });
  if (!plan.rows.length && !plan.extras.length) return NextResponse.json({ updated: 0, created: 0, errors: plan.errors, unknownColumns: plan.unknownColumns });

  const admin = createAdminClient();
  // Excel 的「Memorial Product Cost」包括骨灰龕；後台分開記：紀念品成本（不含骨灰龕）＋骨灰龕成本
  if (plan.excel) {
    const prices = await loadPriceSettings();
    for (const r of [...plan.rows, ...plan.extras]) {
      const urn = r.values.urn ? urnCost(String(r.values.urn), prices.urnCosts) : null;
      const mc = typeof r.values.memorial_cost === "number" ? r.values.memorial_cost : null;
      if (urn && mc != null && mc >= urn) r.values.memorial_cost = Math.round((mc - urn) * 100) / 100;
    }
    // 後台已改為骨灰龕產品代碼（URN…）的單，Excel 仍寫 By Package 時保留後台代碼
    const byPackage = plan.rows.filter((r) => /^by package$/i.test(String(r.values.urn || "")));
    for (let i = 0; i < byPackage.length; i += 500) {
      const { data } = await admin.from("logistics_orders").select("invoice_no, urn").in("invoice_no", byPackage.slice(i, i + 500).map((r) => r.invoiceNo));
      const sku = new Set((data || []).filter((x) => /^URN/i.test(String(x.urn || ""))).map((x) => Number(x.invoice_no)));
      for (const r of byPackage.slice(i, i + 500)) if (sku.has(r.invoiceNo)) delete r.values.urn;
    }
  }
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
  // 附加單（66B 等）：按附加單號合併到原單號的 extra_orders（只更新 CSV 有填的欄位）
  let extrasSaved = 0;
  const byParent = new Map<number, typeof plan.extras>();
  for (const e of plan.extras) byParent.set(e.invoiceNo, [...(byParent.get(e.invoiceNo) || []), e]);
  for (const [parent, list] of byParent) {
    const { data: row, error: readError } = await admin.from("logistics_orders").select("extra_orders").eq("invoice_no", parent).maybeSingle();
    if (readError || !row) { for (const e of list) errors.push(`第 ${e.line} 行（附加單 ${e.ref}）：找不到原單號 ${parent}，未能保存`); continue; }
    const current: ExtraOrder[] = extraOrders(row);
    for (const e of list) {
      const i = current.findIndex((x) => x.ref.toUpperCase() === e.ref);
      if (i >= 0) current[i] = { ...current[i], fields: { ...current[i].fields, ...e.values } };
      else current.push({ ref: e.ref, fields: e.values, source_row: e.line });
    }
    const { error } = await admin.from("logistics_orders").update({ extra_orders: current, updated_at: new Date().toISOString() }).eq("invoice_no", parent);
    if (error) for (const e of list) errors.push(`第 ${e.line} 行（附加單 ${e.ref}）：未能保存（${error.message.slice(0, 80)}）`);
    else extrasSaved += list.length;
  }
  await logAudit("import_logistics_csv", "logistics_orders", null, `CSV 匯入：更新 ${updated}、新增 ${created}${extrasSaved ? `、附加單 ${extrasSaved}` : ""}${errors.length ? `、${errors.length} 項提示` : ""}`);
  return NextResponse.json({ updated, created, extras: extrasSaved, errors, unknownColumns: plan.unknownColumns });
}
