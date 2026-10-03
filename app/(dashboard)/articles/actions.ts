"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const field = (data: FormData, name: string) => String(data.get(name) || "").trim();

// 中文名稱即 Shopify 標籤：不可含逗號（Shopify 以逗號分隔標籤）
function validTag(tag: string) {
  return !!tag && tag.length <= 60 && !/[,，]/.test(tag) && tag.toLowerCase() !== "en";
}

function done() {
  revalidatePath("/articles");
}

export async function addCategory(data: FormData) {
  await requireModule("articles");
  const tag = field(data, "tag");
  const labelEn = field(data, "label_en").slice(0, 80);
  const sortOrder = Math.trunc(Number(field(data, "sort_order") || "0"));
  if (!validTag(tag)) throw new Error("中文名稱必須填寫，最多 60 字，不可包含逗號，亦不可為「en」。");
  if (!Number.isFinite(sortOrder)) throw new Error("排序必須為數字。");
  const { data: row, error } = await createAdminClient()
    .from("blog_categories")
    .insert({ tag, label_en: labelEn, sort_order: sortOrder, is_active: true })
    .select("id")
    .single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? `分類「${tag}」已存在。` : `新增失敗：${error.message}`);
  await logAudit("create_blog_category", "blog_categories", row?.id, tag);
  done();
}

// 一次過儲存全部分類（數量少，全部更新）
export async function saveCategories(data: FormData) {
  await requireModule("articles");
  const ids = data.getAll("id").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const rows = ids.map((id) => {
    const tag = field(data, `${id}:tag`);
    const sortOrder = Math.trunc(Number(field(data, `${id}:sort_order`) || "0"));
    if (!validTag(tag)) throw new Error(`「${tag || "未命名"}」：中文名稱必須填寫，最多 60 字，不可包含逗號，亦不可為「en」。`);
    if (!Number.isFinite(sortOrder)) throw new Error(`「${tag}」：排序必須為數字。`);
    return {
      id,
      tag,
      label_en: field(data, `${id}:label_en`).slice(0, 80),
      sort_order: sortOrder,
      is_active: field(data, `${id}:is_active`) === "true",
      updated_at: new Date().toISOString(),
    };
  });
  const tags = rows.map((r) => r.tag);
  if (new Set(tags).size !== tags.length) throw new Error("分類中文名稱不可重複。");
  const admin = createAdminClient();
  for (const { id, ...payload } of rows) {
    const { error } = await admin.from("blog_categories").update(payload).eq("id", id);
    if (error) throw new Error(`「${payload.tag}」儲存失敗：${error.message}`);
  }
  await logAudit("update_blog_categories", "blog_categories", null, tags.join("、"));
  done();
}

export async function deleteCategory(data: FormData) {
  await requireModule("articles");
  const id = field(data, "delete_id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const admin = createAdminClient();
  const { data: row } = await admin.from("blog_categories").select("tag").eq("id", id).maybeSingle();
  const { error } = await admin.from("blog_categories").delete().eq("id", id);
  if (error) throw new Error(`刪除失敗：${error.message}`);
  await logAudit("delete_blog_category", "blog_categories", id, row?.tag || null);
  done();
}
