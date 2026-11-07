import { NextResponse } from "next/server";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["logistics"])) return new NextResponse("Forbidden", { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "請上傳 CSV。" }, { status: 400 });
  const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ error: "CSV 沒有資料。" }, { status: 400 });
  const headers = lines[0].split(",").map((value) => value.trim());
  const errors: string[] = [];
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));
    if (!row.invoice_no) errors.push(`第 ${i + 1} 行缺少 invoice_no`);
    else rows.push(row);
  }
  if (rows.length) {
    const { error } = await createAdminClient().from("logistics_orders").upsert(rows, { onConflict: "invoice_no" });
    if (error) errors.push(error.message);
  }
  return NextResponse.json({ imported: rows.length, errors });
}

