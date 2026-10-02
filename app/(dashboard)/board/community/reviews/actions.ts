"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

function field(data: FormData, name: string) {
  return String(data.get(name) || "").trim();
}

// 與「主人評價及故事分享」同一權限（管理員或已獲授權員工）
async function requireAdmin() {
  return requireModule("board_community");
}

function validOptionalUrl(value: string) {
  if (!value) return true;
  if (/^(\/|images\/)/i.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// 讀取一則評價的欄位；「儲存全部」時欄位名稱前綴為「評價 id:」
function readReview(data: FormData, prefix = "") {
  const name = field(data, prefix + "display_name");
  const rating = Number(field(data, prefix + "rating"));
  const zh = field(data, prefix + "zh_content");
  const en = field(data, prefix + "en_content");
  const photo = field(data, prefix + "photo_url");
  const source = field(data, prefix + "source_url");
  const sortOrder = Number(field(data, prefix + "sort_order"));
  if (!name || !zh || !Number.isInteger(rating) || rating < 1 || rating > 5 || !Number.isFinite(sortOrder)) {
    throw new Error("請填寫名稱、中文內容、有效星級及排序。");
  }
  if (!validOptionalUrl(photo) || !validOptionalUrl(source)) throw new Error("相片及來源網址只接受 http(s) 或網站內路徑。");
  return {
    display_name: name,
    rating,
    zh_content: zh,
    en_content: en,
    photo_url: photo,
    source_url: source,
    sort_order: Math.trunc(sortOrder),
    is_published: field(data, prefix + "is_published") === "true",
    updated_at: new Date().toISOString(),
  };
}

export async function saveReview(data: FormData) {
  await requireAdmin();
  const id = field(data, "id");
  const name = field(data, "display_name");
  const payload = readReview(data);
  const admin = createAdminClient();
  const result = id
    ? await admin.from("google_reviews").update(payload).eq("id", id).select("id").maybeSingle()
    : await admin.from("google_reviews").insert(payload).select("id").single();
  if (result.error) throw new Error(`儲存失敗：${result.error.message}`);
  await logAudit(id ? "update_google_review" : "create_google_review", "google_reviews", result.data?.id, name);
  revalidatePath("/board/community/reviews");
  redirect("/board/community/reviews");
}

// 一鍵儲存：只更新有修改過的評價（changed_ids），全部驗證通過後才寫入
export async function saveAllReviews(data: FormData) {
  await requireAdmin();
  const ids = [...new Set(field(data, "changed_ids").split(",").map((v) => v.trim()).filter(Boolean))];
  if (!ids.length) return;
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("評價編號無效，請重新整理頁面。");
  const rows = ids.map((id) => {
    try {
      return { id, payload: readReview(data, `${id}:`) };
    } catch (e) {
      const name = field(data, `${id}:display_name`) || "未命名評價";
      throw new Error(`「${name}」：${e instanceof Error ? e.message : "資料無效"}`);
    }
  });
  const admin = createAdminClient();
  for (const { id, payload } of rows) {
    const { error } = await admin.from("google_reviews").update(payload).eq("id", id);
    if (error) throw new Error(`「${payload.display_name}」儲存失敗：${error.message}`);
    await logAudit("update_google_review", "google_reviews", id, payload.display_name);
  }
  revalidatePath("/board/community/reviews");
}

export async function deleteReview(data: FormData) {
  await requireAdmin();
  const id = field(data, "id");
  if (!id) return;
  const { error } = await createAdminClient().from("google_reviews").delete().eq("id", id);
  if (error) throw new Error(`刪除失敗：${error.message}`);
  await logAudit("delete_google_review", "google_reviews", id);
  revalidatePath("/board/community/reviews");
  redirect("/board/community/reviews");
}
