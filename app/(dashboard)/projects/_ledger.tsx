import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { isRslProjectNo } from "@/lib/order-label";
import { addEntry, deleteEntry } from "./actions";

// 專案詳細版面（接送服務、紀念品草稿共用）：資料欄 → 收入／支出／淨額 → 新增收支明細 → 明細表
// 與產品訂單、火化專案詳細頁的樣式一致。收支明細以 project_entries.order_ref 連結。

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const inputCls = "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

type Entry = { id: string; kind: string; description: string; amount: number; entry_date: string; file_path: string | null };

export async function loadEntries(orderRef: string) {
  const supabase = await createClient();
  const res = await supabase
    .from("project_entries")
    .select("id, kind, description, amount, entry_date, file_path")
    .eq("order_ref", orderRef)
    .order("entry_date", { ascending: false });
  const entries = (res.data ?? []) as Entry[];
  const withFile = entries.filter((e) => e.file_path);
  const signed = await Promise.all(withFile.map((e) => supabase.storage.from("project-files").createSignedUrl(e.file_path!, 3600)));
  const urls: Record<string, string> = {};
  withFile.forEach((e, i) => {
    if (signed[i].data?.signedUrl) urls[e.id] = signed[i].data!.signedUrl;
  });
  return { entries, urls, error: res.error };
}

export function ProjectLedger({
  projectNo,
  title,
  badge,
  fields,
  orderRef,
  autoIncome,
  entries,
  urls,
  entriesError,
  canEdit = true,
  notice,
  actions,
}: {
  projectNo: string;
  title: string;
  badge: string;
  fields: { label: string; value: ReactNode }[];
  orderRef: string;
  autoIncome?: { amount: number; date: string; label: string } | null;
  entries: Entry[];
  urls: Record<string, string>;
  entriesError?: unknown;
  canEdit?: boolean;
  notice?: ReactNode;
  actions?: ReactNode;
}) {
  const manualIncome = entries.filter((e) => e.kind === "income").reduce((n, e) => n + (e.amount || 0), 0);
  const expense = entries.filter((e) => e.kind === "expense").reduce((n, e) => n + (e.amount || 0), 0);
  const auto = autoIncome && autoIncome.amount > 0 && manualIncome === 0 ? autoIncome : null;
  const income = manualIncome > 0 ? manualIncome : auto?.amount || 0;
  const net = income - expense;
  const rsl = isRslProjectNo(projectNo);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm text-[var(--soft)]">
        <Link href="/projects" className="hover:underline">專案管理</Link>
        <span>›</span>
        {rsl ? <Link href={`/projects/group/${encodeURIComponent(projectNo)}`} className="hover:underline">{projectNo}</Link> : <span>{projectNo || "—"}</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <span className="rounded-full border border-[var(--line)] bg-[var(--cream)] px-2.5 py-1 text-xs text-[var(--gold-deep)]">{badge}</span>
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mb-6 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="shrink-0 text-[var(--soft)]">{f.label}：</span>
            <span className="break-words text-[var(--ink)]">{f.value || "—"}</span>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-l-4 border-[var(--line)] border-l-green-500 bg-[var(--card)] p-4">
          <div className="mb-1 text-xs text-[var(--soft)]">收入 Income</div>
          <div className="text-xl font-semibold tabular-nums text-green-700 sm:text-2xl">{money(income)}</div>
          {auto && <div className="mt-1 text-[11px] text-[var(--soft)]">{auto.label}自動計入</div>}
        </div>
        <div className="rounded-2xl border border-l-4 border-[var(--line)] border-l-amber-500 bg-[var(--card)] p-4">
          <div className="mb-1 text-xs text-[var(--soft)]">支出 Expense</div>
          <div className="text-xl font-semibold tabular-nums text-amber-700 sm:text-2xl">{money(expense)}</div>
        </div>
        <div className={"rounded-2xl border border-l-4 border-[var(--line)] bg-[var(--card)] p-4 " + (net >= 0 ? "border-l-[var(--gold)]" : "border-l-red-500")}>
          <div className="mb-1 text-xs text-[var(--soft)]">淨額 Net</div>
          <div className={"text-xl font-semibold tabular-nums sm:text-2xl " + (net >= 0 ? "text-[var(--ink)]" : "text-red-700")}>{money(net)}</div>
        </div>
      </div>

      {notice}

      {entriesError ? (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未啟用收支明細。請先於 Supabase SQL Editor 執行 <code>db/migration_project_entries_orders.sql</code>。
        </div>
      ) : canEdit ? (
        <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 font-medium">
            <span className="text-[var(--gold)]">＋</span> 新增收支明細
          </summary>
          <form action={addEntry} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] px-5 pb-5 pt-1">
            <input type="hidden" name="order_ref" value={orderRef} />
            <label className="text-sm">
              <span className="mb-1 block text-[var(--soft)]">類型</span>
              <select name="kind" defaultValue="expense" className={inputCls}>
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </label>
            <label className="min-w-[160px] flex-1 text-sm">
              <span className="mb-1 block text-[var(--soft)]">說明</span>
              <input name="description" required className={inputCls + " w-full"} placeholder="如 車費 / 人工 / 材料成本…" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--soft)]">金額</span>
              <input type="number" step="0.01" name="amount" required className={inputCls + " w-28"} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--soft)]">日期</span>
              <input type="date" name="entry_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--soft)]">文件（收據，可選）</span>
              <input type="file" name="file" className="block w-56 text-sm" />
            </label>
            <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90">新增</button>
          </form>
        </details>
      ) : null}

      {entries.length === 0 && !auto ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無收支明細。</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium">說明</th>
                <th className="px-4 py-3 text-right font-medium">金額</th>
                <th className="px-4 py-3 font-medium">文件</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {auto && (
                <tr className="border-t border-[var(--line)] bg-green-50/40">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--soft)]">{auto.date || "—"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">收入</span></td>
                  <td className="px-4 py-3">{auto.label}（已付款）<span className="text-xs text-[var(--soft)]">　· 系統自動</span></td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-green-700">{"+" + money(auto.amount)}</td>
                  <td className="px-4 py-3"><span className="text-[var(--faint)]">—</span></td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--faint)]">自動</td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-[var(--line)]">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--soft)]">{e.entry_date}</td>
                  <td className="px-4 py-3">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (e.kind === "income" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>
                      {e.kind === "income" ? "收入" : "支出"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{e.description}</td>
                  <td className={"px-4 py-3 text-right font-medium tabular-nums " + (e.kind === "income" ? "text-green-700" : "text-amber-700")}>
                    {(e.kind === "income" ? "+" : "−") + money(e.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {e.file_path && urls[e.id] ? (
                      <a href={urls[e.id]} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">下載</a>
                    ) : (
                      <span className="text-[var(--faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="order_ref" value={orderRef} />
                        <button className="text-xs text-red-600 hover:underline">刪除</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--line)] bg-[var(--head)] font-semibold">
                <td className="px-4 py-3" colSpan={3}>淨額 Net（收入 − 支出）</td>
                <td className={"px-4 py-3 text-right tabular-nums " + (net >= 0 ? "text-[var(--ink)]" : "text-red-700")}>{money(net)}</td>
                <td className="px-4 py-3" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
