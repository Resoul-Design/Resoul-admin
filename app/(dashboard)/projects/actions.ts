"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function addEntry(formData: FormData) {
  const me = await requireModule("projects");
  const booking_id = String(formData.get("booking_id") || "");
  const order_ref = String(formData.get("order_ref") || "");
  const kind = String(formData.get("kind") || "");
  const description = String(formData.get("description") || "").trim();
  const amount = Number(String(formData.get("amount") || "0")) || 0;
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);
  // 需連結到一個專案：火化預約（booking_id）或產品訂單／接送服務（order_ref；接送為 deposit:<id>）
  if ((!booking_id && !order_ref) || !["income", "expense"].includes(kind) || !description) return;

  const supabase = await createClient();
  const keyForPath = (booking_id || order_ref).replace(/[^A-Za-z0-9_-]/g, "_");

  let file_path: string | null = null;
  const file = formData.get("file");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    const f = file as File;
    // 只接受常見單據格式；副檔名只保留英數字，避免路徑字元或可執行的網頁檔
    const raw = (f.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const ext = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "gif", "doc", "docx", "xls", "xlsx", "csv", "txt"].includes(raw) ? raw : "dat";
    const path = `${keyForPath}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("project-files")
      .upload(path, f, { contentType: ext === "dat" ? "application/octet-stream" : f.type || undefined });
    if (!error) file_path = path;
  }

  const row: Record<string, unknown> = { kind, description, amount, entry_date, file_path, created_by: me.id };
  if (booking_id) row.booking_id = booking_id;
  else row.order_ref = order_ref;
  await supabase.from("project_entries").insert(row);
  await logAudit("add_entry", "project_entries", booking_id || order_ref, `${kind} ${amount}｜${description}`);

  if (booking_id) revalidatePath(`/projects/${booking_id}`);
  if (order_ref.startsWith("deposit:")) revalidatePath(`/projects/deposit/${order_ref.slice(8)}`);
  else if (order_ref) revalidatePath(`/projects/order/${order_ref.split("/").pop()}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}

export async function deleteEntry(formData: FormData) {
  await requireModule("projects");
  const id = String(formData.get("id") || "");
  const booking_id = String(formData.get("booking_id") || "");
  const order_ref = String(formData.get("order_ref") || "");
  if (!id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_entries")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  await supabase.from("project_entries").delete().eq("id", id);
  if (data?.file_path) {
    await supabase.storage.from("project-files").remove([data.file_path]);
  }
  await logAudit("delete_entry", "project_entries", id, booking_id || order_ref || null);

  if (booking_id) revalidatePath(`/projects/${booking_id}`);
  if (order_ref.startsWith("deposit:")) revalidatePath(`/projects/deposit/${order_ref.slice(8)}`);
  else if (order_ref) revalidatePath(`/projects/order/${order_ref.split("/").pop()}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}
