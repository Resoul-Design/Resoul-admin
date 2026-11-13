"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { DataCheckResult, DataIssue } from "@/lib/data-check";
import { applyDataFix, runDataCheck } from "./actions";

export function DataCheckPanel() {
  const [result, setResult] = useState<DataCheckResult | null>(null);
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(""); setMsgs({});
    start(async () => {
      const r = await runDataCheck();
      if (r.error) return setError(r.error);
      setResult(r.result || null);
    });
  }
  async function fix(i: number, issue: DataIssue) {
    if (!issue.fix || !window.confirm(`單號 ${issue.invoiceNo}：套餐代碼改為 ${issue.fix.to}？（只更新後台客戶資料）`)) return;
    setBusy(i);
    const r = await applyDataFix(issue.fix);
    setMsgs((m) => ({ ...m, [i]: r.error ? `⚠️ ${r.error}` : `✅ ${r.done}` }));
    setBusy(null);
  }

  const groups = new Map<string, { issue: DataIssue; i: number }[]>();
  result?.issues.forEach((issue, i) => groups.set(issue.category, [...(groups.get(issue.category) || []), { issue, i }]));

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {result ? (
          <div className="text-xs text-[var(--soft)]">
            {Object.entries(result.counts).map(([k, v]) => `${k} ${v}`).join("・")}｜檢查時間 {new Date(result.checkedAt).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
          </div>
        ) : <span />}
        <button type="button" onClick={run} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "核對中…" : result ? "重新核對" : "開始核對"}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {result && (
        <div className="mt-2 text-sm">
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
                      {issue.fix && !msgs[i] && <button type="button" onClick={() => fix(i, issue)} disabled={busy !== null} className="rounded-lg border border-[var(--gold)] px-3 py-1 text-xs text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">{busy === i ? "處理中…" : "按 Shopify 更新"}</button>}
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
