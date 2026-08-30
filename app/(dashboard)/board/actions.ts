"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID = ["held", "visible", "hidden"];

export async function setPostStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !VALID.includes(status)) return;

  const supabase = await createClient();
  await supabase.from("posts").update({ status }).eq("id", id);
  revalidatePath("/board");
  revalidatePath("/");
}

export async function deletePost(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("posts").delete().eq("id", id);
  revalidatePath("/board");
  revalidatePath("/");
}
