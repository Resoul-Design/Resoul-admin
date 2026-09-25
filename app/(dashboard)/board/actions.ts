"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasModule, requireModule } from "@/lib/auth";

const VALID = ["held", "visible", "hidden"];

// 按貼文所屬留言板檢查權限：context 為 blog:* 屬照顧誌，其餘屬同路人留言板
async function boardClientFor(id: string) {
  const staff = await requireModule("board_community", "board_blog");
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("context").eq("id", id).maybeSingle();
  if (!data) return null;
  const key = String(data.context || "").startsWith("blog:") ? "board_blog" : "board_community";
  if (!hasModule(staff, [key])) throw new Error("沒有此留言板的管理權限。");
  return supabase;
}

function revalidateBoards() {
  revalidatePath("/board/blog");
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
