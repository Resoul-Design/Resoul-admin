"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

function field(data: FormData, name: string, max: number) {
  return String(data.get(name) || "").trim().slice(0, max);
}

export async function saveSnippet(data: FormData) {
  await requireModule("replies");
  const id = field(data, "id", 64);
  const title = field(data, "title", 120);
  const category = field(data, "category", 40) || "常用語";
  const zh = field(data, "zh", 4000);
  const en = field(data, "en", 4000);
  const sortOrder = Number(field(data, "sort_order", 10)) || 0;
  const active = data.get("active") === "true";
  if (!title || (!zh && !en)) throw new Error("請填寫標題及最少一個語言的內容。");

  const row = { title, category, zh, en, sort_order: sortOrder, active, updated_at: new Date().toISOString() };
  const supabase = createAdminClient();
  const { error } = id
    ? await supabase.from("reply_snippets").update(row).eq("id", id)
    : await supabase.from("reply_snippets").insert(row);
  if (error) throw new Error("儲存失敗：" + error.message);
  await logAudit(id ? "update_reply_snippet" : "create_reply_snippet", "reply_snippets", id || null, title);
  revalidatePath("/replies");
  revalidatePath("/replies/knowledge");
  redirect("/replies/knowledge");
}

export async function deleteSnippet(data: FormData) {
  await requireModule("replies");
  const id = field(data, "id", 64);
  if (!id) return;
  const { error } = await createAdminClient().from("reply_snippets").delete().eq("id", id);
  if (error) throw new Error("刪除失敗：" + error.message);
  await logAudit("delete_reply_snippet", "reply_snippets", id);
  revalidatePath("/replies");
  revalidatePath("/replies/knowledge");
  redirect("/replies/knowledge");
}
