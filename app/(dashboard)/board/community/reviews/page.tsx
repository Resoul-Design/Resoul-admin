import { PageHeader, headerLinkClass } from "../../../_page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteReviewById, saveAllReviews, saveReview } from "./actions";
import { DeleteButton } from "../../../_delete-button";
import { BulkReviewsForm } from "./_bulk-form";

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

// prefix：「儲存全部」表格內每則評價的欄位前綴（評價 id:），避免欄位名稱重複
function ReviewFields({ review, prefix = "" }: { review?: Review; prefix?: string }) {
  const n = (name: string) => prefix + name;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
        <label className="text-sm">顯示名稱<input required name={n("display_name")} defaultValue={review?.display_name} className={inputClass + " mt-1"} /></label>
        <label className="text-sm">星級<select name={n("rating")} defaultValue={review?.rating || 5} className={inputClass + " mt-1"}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} 星</option>)}</select></label>
        <label className="text-sm">排序<input type="number" name={n("sort_order")} defaultValue={review?.sort_order ?? 0} className={inputClass + " mt-1"} /></label>
      </div>
      <label className="block text-sm">中文評價<textarea required name={n("zh_content")} rows={3} defaultValue={review?.zh_content} className={inputClass + " mt-1"} /></label>
      <label className="block text-sm">英文版本<textarea name={n("en_content")} rows={3} defaultValue={review?.en_content} className={inputClass + " mt-1"} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">相片網址<input name={n("photo_url")} defaultValue={review?.photo_url} className={inputClass + " mt-1"} placeholder="可留空" /></label>
        <label className="text-sm">Google 來源網址<input name={n("source_url")} defaultValue={review?.source_url} className={inputClass + " mt-1"} placeholder="可留空" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={n("is_published")} value="true" defaultChecked={review?.is_published ?? false} className="h-4 w-4 accent-[var(--gold)]" />在 Resoul 網站顯示</label>
    </>
  );
}

export default async function GoogleReviewsAdminPage() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["board_community"])) notFound();
  const { data, error } = await createAdminClient().from("google_reviews").select("*").order("sort_order").order("created_at");
  const reviews = (data || []) as Review[];

  return (
    <div>
      <PageHeader title="Google 評價管理">
        <Link href="/board/community" className={headerLinkClass}>← 主人評價及故事分享</Link>
      </PageHeader>

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
          {reviews.length > 0 && (
            <BulkReviewsForm action={saveAllReviews}>
              <div className="space-y-3">
                {reviews.map((review) => (
                  <section key={review.id} data-review-id={review.id} className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                    <div className="flex items-center justify-between gap-3"><h2 className="font-medium">{review.display_name}</h2><span className={"text-xs " + (review.is_published ? "text-green-700" : "text-[var(--soft)]")}>{review.is_published ? "網站顯示中" : "已隱藏"}</span></div>
                    <ReviewFields review={review} prefix={`${review.id}:`} />
                    <div className="flex justify-end">
                      <DeleteButton id={review.id} action={deleteReviewById} label="刪除評價" confirmText={`確定刪除「${review.display_name}」這則評價？刪除後無法復原。`} />
                    </div>
                  </section>
                ))}
              </div>
            </BulkReviewsForm>
          )}
        </>
      )}
    </div>
  );
}
