import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPLY_CATEGORIES, REPLY_TOKENS, type ReplySnippet } from "@/lib/reply";
import { deleteSnippet, saveSnippet } from "../actions";
import { ConfirmDelete } from "./_confirm";

export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";

function SnippetFields({ snippet }: { snippet?: ReplySnippet }) {
  return (
    <>
      {snippet && <input type="hidden" name="id" value={snippet.id} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_100px]">
        <label className="text-sm">標題<input required name="title" defaultValue={snippet?.title} className={inputClass + " mt-1"} /></label>
        <label className="text-sm">分類
          <select name="category" defaultValue={snippet?.category || "常用語"} className={inputClass + " mt-1"}>
            {[...new Set([...REPLY_CATEGORIES, snippet?.category || "常用語"])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">排序<input type="number" name="sort_order" defaultValue={snippet?.sort_order ?? 0} className={inputClass + " mt-1"} /></label>
      </div>
      <label className="block text-sm">中文回覆<textarea name="zh" rows={5} defaultValue={snippet?.zh} className={inputClass + " mt-1 leading-6"} /></label>
      <label className="block text-sm">英文回覆<textarea name="en" rows={5} defaultValue={snippet?.en} className={inputClass + " mt-1 leading-6"} /></label>
      <p className="text-xs leading-5 text-[var(--soft)]">可用代號（插入時自動填入客人資料）：{REPLY_TOKENS.join("　")}。收費或安排有變時，請同步修改此處及網站。</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="true" defaultChecked={snippet?.active ?? true} className="h-4 w-4 accent-[var(--gold)]" />
        在回覆助手顯示
      </label>
    </>
  );
}

export default async function ReplyKnowledgePage() {
  const { data, error } = await createAdminClient()
    .from("reply_snippets")
    .select("id, slug, category, title, zh, en, sort_order, active")
    .order("category")
    .order("sort_order");
  const snippets = (data ?? []) as ReplySnippet[];
  const order = (c: string) => {
    const i = REPLY_CATEGORIES.indexOf(c);
    return i < 0 ? 99 : i;
  };
  const groups = [...new Set(snippets.map((s) => s.category))].sort((a, b) => order(a) - order(b));

  return (
    <div>
      <div className="mb-5">
        <Link href="/replies" className="text-sm text-[var(--gold)] hover:underline">← 回覆助手</Link>
        <h1 className="mt-3 text-2xl font-semibold">回覆知識庫</h1>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未啟用回覆知識庫：請先於 Supabase（diyxcx）執行 <code>db/migration_reply_snippets.sql</code>。
        </div>
      ) : (
        <>
          <details className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <summary className="cursor-pointer font-medium">＋ 新增回覆</summary>
            <form action={saveSnippet} className="mt-4 space-y-3">
              <SnippetFields />
              <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">新增</button>
            </form>
          </details>

          {groups.map((g) => (
            <section key={g} className="mb-6">
              <h2 className="mb-2 text-base font-semibold">{g}</h2>
              <div className="space-y-2">
                {snippets.filter((s) => s.category === g).map((s) => (
                  <details key={s.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                    <summary className="cursor-pointer text-sm">
                      <span className="font-medium">{s.title}</span>
                      {!s.active && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">已隱藏</span>}
                    </summary>
                    <form action={saveSnippet} className="mt-4 space-y-3">
                      <SnippetFields snippet={s} />
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">儲存</button>
                      </div>
                    </form>
                    <form action={deleteSnippet} className="mt-2">
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmDelete />
                    </form>
                  </details>
                ))}
              </div>
            </section>
          ))}
          {snippets.length === 0 && <p className="text-sm text-[var(--soft)]">知識庫暫無內容。</p>}
        </>
      )}
    </div>
  );
}
