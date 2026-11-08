"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Issue, ReconcileResult } from "@/lib/reconcile";
import { fixIssue, runReconcile } from "./_reconcile-actions";

const FIX_LABEL: Record<string, string> = { "refresh-lines": "按 Shopify 更新項目", "booking-cancel": "按 Shopify 標記取消／退款", "booking-paid": "按 Shopify 標記已付款", "company-paid": "標記已付款", "product-refresh": "按 Shopify 更新" };

// 後台與 Shopify 對帳：按掣即時比較，安全的情況可一鍵修正（只改後台）
export function ReconcilePanel() {
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [includeTest, setIncludeTest] = useState(false);

  function run() {
    setError(""); setMsgs({});
    start(async () => {
      const r = await runReconcile(includeTest);
      if (r.error) return setError(r.error);
      setResult(r.result || null);
    });
  }
  async function fix(i: number, issue: Issue) {
    if (!issue.fix) return;
    setBusy(i);
    const r = await fixIssue(issue.fix);
    setMsgs((m) => ({ ...m, [i]: r.error ? `⚠️ ${r.error}` : `✅ ${r.done}` }));
    setBusy(null);
  }

  // 逐項修正所有可一鍵修正的項目（逐張處理，避免同時大量寫入）
  async function fixAll() {
    if (!result) return;
    const todo = result.issues.map((issue, i) => ({ issue, i })).filter(({ issue, i }) => issue.fix && !msgs[i]);
    if (!todo.length || !window.confirm(`確定按 Shopify 修正全部 ${todo.length} 項？（只會更新後台）`)) return;
    for (const { issue, i } of todo) await fix(i, issue);
  }
  const fixable = result ? result.issues.filter((issue, i) => issue.fix && !msgs[i]).length : 0;

  const groups = new Map<string, { issue: Issue; i: number }[]>();
  result?.issues.forEach((issue, i) => groups.set(issue.category, [...(groups.get(issue.category) || []), { issue, i }]));

  return (
    <section className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">後台與 Shopify 對帳</div>
          <div className="text-xs text-[var(--soft)]">比較付款狀態、金額、取消／退款、付款連結、開新單及紀念品訂單（預設不含測試記錄）。修正只會更新後台，以 Shopify 實際資料為準。</div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--soft)]"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />包括測試記錄</label>
        <button type="button" onClick={run} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "對帳中…" : result ? "重新對帳" : "開始對帳"}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {result && (
        <div className="mt-4 text-sm">
          <div className="text-xs text-[var(--soft)]">
            {Object.entries(result.counts).map(([k, v]) => `${k} ${v}`).join("・")}｜檢查時間 {new Date(result.checkedAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
          </div>
          {fixable > 1 && <button type="button" onClick={fixAll} disabled={busy !== null} className="mt-3 rounded-lg border border-[var(--gold)] px-3 py-1.5 text-sm text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">全部修正（{fixable} 項）</button>}
          {!result.issues.length ? (
            <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-green-800">✅ 全部一致，沒有需要處理的項目。</p>
          ) : (
            [...groups.entries()].map(([cat, items]) => (
              <div key={cat} className="mt-4">
                <div className="mb-1 font-medium">{cat}（{items.length}）</div>
                <ul className="space-y-1">
                  {items.map(({ issue, i }) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2">
                      <span className="font-medium text-[var(--gold)]">單號 {issue.invoiceNo}</span>
                      <span className="min-w-0 flex-1 break-words">{issue.text}</span>
                      {issue.fix && !msgs[i] && <button type="button" onClick={() => fix(i, issue)} disabled={busy !== null} className="rounded-lg border border-[var(--gold)] px-3 py-1 text-xs text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">{busy === i ? "處理中…" : FIX_LABEL[issue.fix.kind]}</button>}
                      {issue.link && <Link href={issue.link} className="text-xs text-[var(--gold)] hover:underline">前往處理 ↗</Link>}
                      {msgs[i] && <span className="text-xs">{msgs[i]}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
