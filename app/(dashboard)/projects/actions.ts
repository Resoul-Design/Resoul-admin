"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";

export async function addEntry(formData: FormData) {
  const me = await getStaff();
  if (!me) return;
  const booking_id = String(formData.get("booking_id") || "");
  const order_ref = String(formData.get("order_ref") || "");
  const kind = String(formData.get("kind") || "");
  const description = String(formData.get("description") || "").trim();
  const amount = Number(String(formData.get("amount") || "0")) || 0;
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);
  // 需連結到一個專案：火化預約（booking_id）或產品訂單（order_ref）
  if ((!booking_id && !order_ref) || !["income", "expense"].includes(kind) || !description) return;

  const supabase = await createClient();
  const keyForPath = (booking_id || order_ref).replace(/[^A-Za-z0-9_-]/g, "_");

  let file_path: string | null = null;
  const file = formData.get("file");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    const f = file as File;
    const ext = (f.name.split(".").pop() || "dat").toLowerCase();
    const path = `${keyForPath}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("project-files")
      .upload(path, f, { contentType: f.type || undefined });
    if (!error) file_path = path;
  }

  const row: Record<string, unknown> = { kind, description, amount, entry_date, file_path, created_by: me.id };
  if (booking_id) row.booking_id = booking_id;
  else row.order_ref = order_ref;
  await supabase.from("project_entries").insert(row);

  if (booking_id) revalidatePath(`/projects/${booking_id}`);
  if (order_ref) revalidatePath(`/projects/order/${order_ref.split("/").pop()}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}

export async function deleteEntry(formData: FormData) {
  const me = await getStaff();
  if (!me) return;
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

  if (booking_id) revalidatePath(`/projects/${booking_id}`);
  if (order_ref) revalidatePath(`/projects/order/${order_ref.split("/").pop()}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}

// 刪除整個火化專案（連帶其收支明細）——僅限管理員；不可還原。
export async function deleteProject(formData: FormData) {
  const me = await getStaff();
  if (!me || me.role !== "admin") return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  const admin = createAdminClient();
  // 先刪明細（若外鍵未設 cascade 亦安全），再刪預約本身
  await admin.from("project_entries").delete().eq("booking_id", id);
  await admin.from("cremation_bookings").delete().eq("id", id);
  revalidatePath("/projects");
  revalidatePath("/finance");
  revalidatePath("/");
}
