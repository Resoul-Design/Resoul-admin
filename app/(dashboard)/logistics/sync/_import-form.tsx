"use client";

import { useState } from "react";

type Result = { updated?: number; created?: number; errors?: string[]; unknownColumns?: string[]; error?: string };

// 上傳 CSV 並顯示結果（逐行提示）
export function ImportForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/logistics/sync", { method: "POST", body: new FormData(e.currentTarget) });
      setResult(res.headers.get("content-type")?.includes("json") ? await res.json() : { error: res.status === 403 ? "沒有權限。" : "上傳失敗，請稍後再試。" });
    } catch {
      setResult({ error: "上傳失敗，請檢查網絡後再試。" });
    }
    setPending(false);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-5 flex flex-wrap items-center gap-3">
        <input name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
        <button disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "匯入中…" : "開始匯入"}</button>
      </form>
      {result && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 text-sm" role="status">
          {result.error ? <p className="text-red-700">{result.error}</p> : <p className="font-medium text-green-800">已更新 {result.updated ?? 0} 筆、新增 {result.created ?? 0} 筆。</p>}
          {!!result.unknownColumns?.length && <p className="mt-2 text-amber-700">以下欄位名稱無法對應，已略過：{result.unknownColumns.join("、")}</p>}
          {!!result.errors?.length && (
            <ul className="mt-2 max-h-64 list-disc space-y-0.5 overflow-auto pl-5 text-amber-800">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
