"use client";

import { useMemo, useState } from "react";
import type { ReviewItem, ReviewResult } from "@/lib/excel-sync";

type Done = { done: true; kind: "logistics" | "memorial"; updated?: number; created?: number; extras?: number; added?: number; errors: string[] };

// 由 Excel 匯入：①上載 CSV 預覽差異 ②逐項（或逐欄）核准 ③寫入
export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setPending(true); setError("");
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    if (mode === "apply") body.set("approved", JSON.stringify(Object.fromEntries(Object.entries(picked).filter(([, s]) => s.size).map(([id, s]) => [id, [...s]]))));
    try {
      const res = await fetch("/api/logistics/sync", { method: "POST", body });
      const data = res.headers.get("content-type")?.includes("json") ? await res.json() : { error: res.status === 403 ? "沒有權限。" : "上傳失敗，請稍後再試。" };
      if (data.error) setError(data.error);
      else if (mode === "preview") {
        const r = data as ReviewResult;
        setReview(r); setDone(null);
        // 預設全部剔選（找不到原單號的附加單不能寫入）
        setPicked(Object.fromEntries(r.items.filter((it) => it.changes.length).map((it) => [it.id, new Set(it.changes.map((c) => c.field))])));
      } else { setDone(data as Done); setReview(null); setPicked({}); }
    } catch { setError("上傳失敗，請檢查網絡後再試。"); }
    setPending(false);
  }

  const items = useMemo(() => (review?.items || []).filter((it) => !onlyNew || it.action === "new"), [review, onlyNew]);
  const count = Object.values(picked).filter((s) => s.size).length;
  const toggleItem = (it: ReviewItem, on: boolean) => setPicked((p) => ({ ...p, [it.id]: new Set(on ? it.changes.map((c) => c.field) : []) }));
  const toggleField = (it: ReviewItem, field: string, on: boolean) => setPicked((p) => { const s = new Set(p[it.id] || []); if (on) s.add(field); else s.delete(field); return { ...p, [it.id]: s }; });
  const setAll = (on: boolean) => setPicked(Object.fromEntries((review?.items || []).filter((it) => it.changes.length).map((it) => [it.id, new Set(on ? it.changes.map((c) => c.field) : [])])));

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setReview(null); setDone(null); setError(""); }} className="text-sm" />
        <button type="button" onClick={() => send("preview")} disabled={!file || pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white disabled:opacity-50">{pending && !review ? "比較中…" : "比較差異"}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}

      {review && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium">{review.kind === "memorial" ? "紀念品" : "客戶資料"}：{review.items.length} 項有更改、{review.unchanged} 項相同（不會改動）</p>
            {review.items.length > 0 && <>
              <button type="button" onClick={() => setAll(true)} className="text-[var(--gold)] hover:underline">全選</button>
              <button type="button" onClick={() => setAll(false)} className="text-[var(--gold)] hover:underline">全不選</button>
              <label className="flex items-center gap-1"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />只看新增</label>
            </>}
          </div>
          {!!review.unknownColumns.length && <p className="mt-2 text-amber-700">以下欄位名稱無法對應，已略過：{review.unknownColumns.join("、")}</p>}
          {!!review.errors.length && <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-amber-800">{review.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div className="mt-3 max-h-[60vh] space-y-2 overflow-auto">
            {items.map((it) => {
              const sel = picked[it.id] || new Set<string>();
              return (
                <div key={it.id} className="rounded-lg border border-[var(--line)] p-3">
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" disabled={!it.changes.length} checked={sel.size > 0 && sel.size === it.changes.length} onChange={(e) => toggleItem(it, e.target.checked)} />
                    {it.title}
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (it.action === "new" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{it.action === "new" ? "新增" : `更改 ${it.changes.length} 欄`}</span>
                  </label>
                  {it.changes.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {it.changes.map((c) => (
                          <tr key={c.field} className="border-t border-[var(--line)] align-top">
                            <td className="w-6 py-1"><input type="checkbox" checked={sel.has(c.field)} onChange={(e) => toggleField(it, c.field, e.target.checked)} aria-label={c.label} /></td>
                            <td className="w-32 py-1 pr-2 text-[var(--soft)]">{c.label}</td>
                            <td className="py-1 pr-2 text-[var(--soft)] line-through decoration-[var(--soft)]/50">{c.from ? c.from.slice(0, 300) : "（空白）"}</td>
                            <td className="py-1">{c.to.slice(0, 300)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
          {review.items.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => { if (window.confirm(`確定寫入已核准的 ${count} 項？`)) send("apply"); }} disabled={!count || pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-white disabled:opacity-50">{pending ? "寫入中…" : `核准並寫入（${count} 項）`}</button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 text-sm" role="status">
          <p className="font-medium text-green-800">
            {done.kind === "memorial" ? `紀念品：新增 ${done.added ?? 0} 件、更新 ${done.updated ?? 0} 件。` : `客戶資料：更新 ${done.updated ?? 0} 張、新增 ${done.created ?? 0} 張${done.extras ? `、附加單 ${done.extras} 張` : ""}。`}
          </p>
          {!!done.errors.length && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-800">{done.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </>
  );
}
