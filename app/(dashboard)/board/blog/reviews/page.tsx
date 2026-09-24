import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteReview, saveReview } from "./actions";

export const dynamic = "force-dynamic";

type Review = {
  id: string;
  display_name: string;
  rating: number;
  zh_content: string;
  en_content: string;
  photo_url: string;
  source_url: string;
  sort_order: number;
  is_published: boolean;
};

const inputClass = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";

function ReviewFields({ review }: { review?: Review }) {
  return (
    <>
      {review && <input type="hidden" name="id" value={review.id} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <label className="text-sm">顯示名稱<input required name="display_name" defaultValue={review?.display_name} className={inputClass + " mt-1"} /></label>
        <label className="text-sm">星級<select name="rating" defaultValue={review?.rating || 5} className={inputClass + " mt-1"}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} 星</option>)}</select></label>
        <label className="text-sm">排序<input type="number" name="sort_order" defaultValue={review?.sort_order ?? 0} className={inputClass + " mt-1"} /></label>
      </div>
      <label className="block text-sm">中文評價<textarea required name="zh_content" rows={3} defaultValue={review?.zh_content} className={inputClass + " mt-1"} /></label>
      <label className="block text-sm">英文版本<textarea name="en_content" rows={3} defaultValue={review?.en_content} className={inputClass + " mt-1"} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">相片網址<input name="photo_url" defaultValue={review?.photo_url} className={inputClass + " mt-1"} placeholder="可留空" /></label>
        <label className="text-sm">Google 來源網址<input name="source_url" defaultValue={review?.source_url} className={inputClass + " mt-1"} placeholder="可留空" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" value="true" defaultChecked={review?.is_published ?? false} className="h-4 w-4 accent-[var(--gold)]" />在 Resoul 網站顯示</label>
    </>
  );
}

export default async function GoogleReviewsAdminPage() {
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") notFound();
  const { data, error } = await createAdminClient().from("google_reviews").select("*").order("sort_order").order("created_at");
  const reviews = (data || []) as Review[];

  return (
    <div>
      <div className="mb-5">
        <Link href="/board/blog" className="text-sm text-[var(--gold)] hover:underline">← 照顧誌留言</Link>
        <h1 className="mt-3 text-2xl font-semibold">Google 評價管理</h1>
        <p className="mt-1 text-sm text-[var(--soft)]">只管理 Resoul 網站展示內容，不會修改 Google 商家頁。請確保評價引文忠於原文；英文欄可填翻譯。</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          尚未建立評價資料表，或目前無法讀取。請先於 Supabase 執行 <code>db/migration_google_reviews.sql</code>。<div className="mt-2 text-xs">{error.message}</div>
        </div>
      ) : (
        <>
          <form action={saveReview} className="mb-5 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="font-medium">新增評價</h2>
            <ReviewFields />
            <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90">新增</button>
          </form>
          <div className="mb-2 text-xs text-[var(--soft)]">共 {reviews.length} 則</div>
          <div className="space-y-3">
            {reviews.map((review) => (
              <form key={review.id} action={saveReview} className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-3"><h2 className="font-medium">{review.display_name}</h2><span className={"text-xs " + (review.is_published ? "text-green-700" : "text-[var(--soft)]")}>{review.is_published ? "網站顯示中" : "已隱藏"}</span></div>
                <ReviewFields review={review} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90">儲存</button>
                  <button formAction={deleteReview} formNoValidate className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50">刪除評價</button>
                </div>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
