"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

function field(data: FormData, name: string) {
  return String(data.get(name) || "").trim();
}

async function requireAdmin() {
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") throw new Error("只有管理員可以管理網站評價。");
  return staff;
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

export async function saveReview(data: FormData) {
  await requireAdmin();
  const id = field(data, "id");
  const name = field(data, "display_name");
  const rating = Number(field(data, "rating"));
  const zh = field(data, "zh_content");
  const en = field(data, "en_content");
  const photo = field(data, "photo_url");
  const source = field(data, "source_url");
  const sortOrder = Number(field(data, "sort_order"));
  if (!name || !zh || !Number.isInteger(rating) || rating < 1 || rating > 5 || !Number.isFinite(sortOrder)) {
    throw new Error("請填寫名稱、中文內容、有效星級及排序。");
  }
  if (!validOptionalUrl(photo) || !validOptionalUrl(source)) throw new Error("相片及來源網址只接受 http(s) 或網站內路徑。");

  const admin = createAdminClient();
  const payload = {
    display_name: name,
    rating,
    zh_content: zh,
    en_content: en,
    photo_url: photo,
    source_url: source,
    sort_order: Math.trunc(sortOrder),
    is_published: field(data, "is_published") === "true",
    updated_at: new Date().toISOString(),
  };
  const result = id
    ? await admin.from("google_reviews").update(payload).eq("id", id).select("id").maybeSingle()
    : await admin.from("google_reviews").insert(payload).select("id").single();
  if (result.error) throw new Error(`儲存失敗：${result.error.message}`);
  await logAudit(id ? "update_google_review" : "create_google_review", "google_reviews", result.data?.id, name);
  revalidatePath("/board/blog/reviews");
  redirect("/board/blog/reviews");
}

export async function deleteReview(data: FormData) {
  await requireAdmin();
  const id = field(data, "id");
  if (!id) return;
  const { error } = await createAdminClient().from("google_reviews").delete().eq("id", id);
  if (error) throw new Error(`刪除失敗：${error.message}`);
  await logAudit("delete_google_review", "google_reviews", id);
  revalidatePath("/board/blog/reviews");
  redirect("/board/blog/reviews");
}
