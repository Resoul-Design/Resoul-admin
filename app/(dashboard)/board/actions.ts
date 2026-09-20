"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const VALID = ["held", "visible", "hidden"];

function revalidateBoards() {
  revalidatePath("/board/blog");
  revalidatePath("/board/community");
  revalidatePath("/");
}

export async function setPostStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !VALID.includes(status)) return;

  const supabase = await createClient();
  await supabase.from("posts").update({ status }).eq("id", id);
  await logAudit("set_post_status", "posts", id, status);
  revalidateBoards();
}

export async function deletePost(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("posts").delete().eq("id", id);
  await logAudit("delete_post", "posts", id);
  revalidateBoards();
}
