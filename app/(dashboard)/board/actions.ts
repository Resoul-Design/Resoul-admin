"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { requireModule } from "@/lib/auth";

const VALID = ["held", "visible", "hidden"];

// 照顧誌沒有留言功能，所有貼文均屬「主人評價及故事分享」權限
async function boardClientFor(id: string) {
  await requireModule("board_community");
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("id").eq("id", id).maybeSingle();
  if (!data) return null;
  return supabase;
}

function revalidateBoards() {
  revalidatePath("/board/community");
  revalidatePath("/");
}

export async function setPostStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !VALID.includes(status)) return;

  const supabase = await boardClientFor(id);
  if (!supabase) return;
  await supabase.from("posts").update({ status }).eq("id", id);
  await logAudit("set_post_status", "posts", id, status);
  revalidateBoards();
}

export async function deletePost(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = await boardClientFor(id);
  if (!supabase) return;
  await supabase.from("posts").delete().eq("id", id);
  await logAudit("delete_post", "posts", id);
  revalidateBoards();
}
