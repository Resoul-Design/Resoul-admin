import { PageHeader } from "../_page-header";
import { shopifyGraphQL } from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import { addCategory, deleteCategory, saveCategories } from "./actions";

export const dynamic = "force-dynamic";

const articleText = (html: string | null) =>
  (html || "（沒有內容）")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

type Article = {
  id: string;
  title: string;
  handle: string;
  publishedAt: string | null;
  tags: string[];
  author: { name: string | null } | null;
  body: string | null;
};

type BlogsResp = {
  blogs: {
    edges: {
      node: {
        id: string;
        title: string;
        handle: string;
        articles: { edges: { node: Article }[] };
      };
    }[];
  };
};

type Category = { id: string; tag: string; label_en: string; sort_order: number; is_active: boolean };

const QUERY = `{
  blogs(first: 5) {
    edges { node {
      id title handle
      articles(first: 50) {
        edges { node { id title handle publishedAt tags author { name } body } }
      }
    } }
  }
}`;

const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const isEn = (t: string) => t.trim().toLowerCase() === "en";

export default async function ArticlesPage() {
  let data: BlogsResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<BlogsResp>(QUERY);
  } catch (e) {
    err = String(e);
  }
  const catRes = await createAdminClient()
    .from("blog_categories")
    .select("id, tag, label_en, sort_order, is_active")
    .order("sort_order")
    .order("created_at");
  const categories = (catRes.data || []) as Category[];

  const blogs = data?.blogs.edges.map((e) => e.node) ?? [];
  const articles = blogs.flatMap((b) => b.articles.edges.map((e) => e.node));
  const totalArticles = articles.length;
  const categoryTags = new Set(categories.map((c) => c.tag));
  const countFor = (tag: string) => articles.filter((a) => (a.tags || []).some((t) => t.trim() === tag)).length;
  // Shopify 上有、但未設為分類的標籤（多數是打錯字）
  const strayTags = [...new Set(articles.flatMap((a) => (a.tags || []).map((t) => t.trim())))].filter((t) => t && !isEn(t) && !categoryTags.has(t));
  const nextSort = (categories.reduce((n, c) => Math.max(n, c.sort_order), 0) || 0) + 10;

  return (
    <div>
      <PageHeader title="文章記錄" />

      {/* 文章分類：平時收起，按「管理文章分類」才展開 */}
      <details className="group mb-6">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)]">
            管理文章分類{catRes.error ? "" : `（${categories.length} 個）`}
            <span className="text-xs text-[var(--soft)] transition-transform group-open:rotate-90">▸</span>
          </span>
          {!catRes.error && strayTags.length > 0 && (
            <span className="text-xs text-amber-700">有 {strayTags.length} 個 Shopify 標籤未設為分類</span>
          )}
        </summary>
      <section className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h2 className="mb-3 text-base font-semibold">文章分類</h2>
        {catRes.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            未啟用文章分類：請先於 Supabase（diyxcx）執行 <code>db/migration_blog_categories.sql</code>。網站暫時使用預設的四個分類。
          </div>
        ) : (
          <>
            {categories.length > 0 && (
              <form action={saveCategories}>
                <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_80px_90px_80px_56px] gap-3 px-1 pb-2 text-xs text-[var(--soft)] md:grid">
                  <span>中文名稱（須與 Shopify 標籤相同）</span>
                  <span>英文網站名稱</span>
                  <span>排序</span>
                  <span>網站顯示</span>
                  <span>文章</span>
                  <span />
                </div>
                <div className="space-y-3 md:space-y-2">
                  {categories.map((c) => {
                    const n = countFor(c.tag);
                    return (
                      <div key={c.id} className="grid grid-cols-2 items-center gap-3 rounded-xl border border-[var(--line)] p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_80px_90px_80px_56px] md:border-0 md:p-1">
                        <input type="hidden" name="id" value={c.id} />
                        <input required name={`${c.id}:tag`} defaultValue={c.tag} maxLength={60} aria-label="中文名稱" className={input + " col-span-2 md:col-span-1"} />
                        <input name={`${c.id}:label_en`} defaultValue={c.label_en} maxLength={80} aria-label="英文網站名稱" placeholder="English name" className={input + " col-span-2 md:col-span-1"} />
                        <input type="number" name={`${c.id}:sort_order`} defaultValue={c.sort_order} aria-label="排序" className={input} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name={`${c.id}:is_active`} value="true" defaultChecked={c.is_active} className="h-4 w-4 accent-[var(--gold)]" />
                          顯示
                        </label>
                        <span className={"text-sm " + (n ? "text-[var(--ink)]" : "text-amber-700")}>{n ? `${n} 篇` : "未有文章"}</span>
                        <button formAction={deleteCategory} formNoValidate name="delete_id" value={c.id} className="justify-self-end rounded-lg px-2 py-1.5 text-sm text-red-700 hover:bg-red-50">刪除</button>
                      </div>
                    );
                  })}
                </div>
                <button className="mt-3 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">儲存全部分類</button>
              </form>
            )}

            <form action={addCategory} className="mt-5 grid grid-cols-2 items-end gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_80px_auto]">
              <label className="col-span-2 text-sm md:col-span-1">新增分類（中文名稱）<input required name="tag" maxLength={60} className={input + " mt-1"} /></label>
              <label className="col-span-2 text-sm md:col-span-1">英文網站名稱<input name="label_en" maxLength={80} className={input + " mt-1"} /></label>
              <label className="text-sm">排序<input type="number" name="sort_order" defaultValue={nextSort} className={input + " mt-1"} /></label>
              <button className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm hover:bg-[var(--cream)]">＋ 新增</button>
            </form>

            {strayTags.length > 0 && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                以下 Shopify 文章標籤未設為分類，網站不會顯示：{strayTags.map((t) => `「${t}」`).join("、")}
              </p>
            )}
          </>
        )}
      </section>
      </details>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && totalArticles === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無文章。
        </div>
      )}

      {blogs.map((b) =>
        b.articles.edges.length === 0 ? null : (
          <div key={b.id} className="mb-6">
            <h2 className="text-sm font-medium text-[var(--gold)] mb-2">
              {b.title}
            </h2>
            <div className="space-y-2">
              {[...b.articles.edges]
                .sort((x, y) =>
                  (y.node.publishedAt || "").localeCompare(x.node.publishedAt || "")
                )
                .map((a) => (
                  <details
                    key={a.node.id}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--card)] group"
                  >
                    <summary className="cursor-pointer list-none px-4 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-[var(--gold)] text-xs transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      <span className="font-medium">{a.node.title}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {(a.node.tags || []).map((t) => (
                          <span
                            key={t}
                            className={
                              "rounded-full px-2 py-0.5 text-xs " +
                              (isEn(t) ? "bg-blue-50 text-blue-800" : categoryTags.has(t.trim()) ? "bg-[var(--cream)] text-[var(--gold)]" : "bg-amber-50 text-amber-800")
                            }
                          >
                            {isEn(t) ? "英文" : t}
                          </span>
                        ))}
                        {!(a.node.tags || []).some((t) => categoryTags.has(t.trim())) && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">未分類</span>
                        )}
                      </span>
                      <span className="ml-auto text-xs text-[var(--soft)] whitespace-nowrap">
                        {a.node.author?.name || "—"}
                        {a.node.publishedAt
                          ? "　·　" + a.node.publishedAt.slice(0, 10)
                          : "　·　未發佈"}
                      </span>
                    </summary>
                    <div className="px-4 pb-4 border-t border-[var(--line)] pt-3">
                      <div className="article-body max-h-[420px] overflow-y-auto whitespace-pre-wrap pr-1 [scrollbar-gutter:stable]">
                        {articleText(a.node.body)}
                      </div>
                    </div>
                  </details>
                ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
