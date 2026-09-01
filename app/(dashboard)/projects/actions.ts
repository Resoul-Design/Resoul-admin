"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";

export async function addEntry(formData: FormData) {
  const me = await getStaff();
  if (!me) return;
  const booking_id = String(formData.get("booking_id") || "");
  const kind = String(formData.get("kind") || "");
  const description = String(formData.get("description") || "").trim();
  const amount = Number(String(formData.get("amount") || "0")) || 0;
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);
  if (!booking_id || !["income", "expense"].includes(kind) || !description) return;

  const supabase = await createClient();

  let file_path: string | null = null;
  const file = formData.get("file");
  if (file && typeof file === "object" && "size" in file && file.size > 0) {
    const f = file as File;
    const ext = (f.name.split(".").pop() || "dat").toLowerCase();
    const path = `${booking_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("project-files")
      .upload(path, f, { contentType: f.type || undefined });
    if (!error) file_path = path;
  }

  await supabase.from("project_entries").insert({
    booking_id,
    kind,
    description,
    amount,
    entry_date,
    file_path,
    created_by: me.id,
  });

  revalidatePath(`/projects/${booking_id}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}

export async function deleteEntry(formData: FormData) {
  const me = await getStaff();
  if (!me) return;
  const id = String(formData.get("id") || "");
  const booking_id = String(formData.get("booking_id") || "");
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

  revalidatePath(`/projects/${booking_id}`);
  revalidatePath("/projects");
  revalidatePath("/finance");
}
