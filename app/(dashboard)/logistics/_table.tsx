"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type LogisticsRow = { invoiceNo: string; owner: string; phone: string; pet: string; plan: string; arrival: string; deposit: string; balance: string; status: string; updated: string; raw: Record<string, unknown> };

export function LogisticsTable({ rows, error }: { rows: LogisticsRow[]; error: string | null }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return q ? rows.filter((r) => [r.invoiceNo, r.owner, r.phone, r.pet].join(" ").toLowerCase().includes(q)) : rows; }, [rows, query]);
  return <div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">讀取客戶資料失敗：{error}</div>}
    <div className="mb-4 flex flex-wrap items-center gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋發票編號／電話／寵物／主人" className="min-w-[260px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm" /><Link href="/logistics/sync" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">由 Excel 同步</Link><span className="text-xs text-[var(--soft)]">共 {filtered.length} 筆</span></div>
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["單號","主人／電話","寵物","到達","更新"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{filtered.map((r) => <tr key={r.invoiceNo + r.phone} className="border-t border-[var(--line)] align-top hover:bg-[var(--cream)]"><td className="px-4 py-3 font-medium text-[var(--gold)]"><Link href={`/logistics/${encodeURIComponent(r.invoiceNo)}`} className="hover:underline">{r.invoiceNo}</Link></td><td className="px-4 py-3">{r.owner || "—"}<div className="text-xs text-[var(--soft)]">{r.phone || "—"}</div></td><td className="px-4 py-3">{r.pet || "—"}</td><td className="px-4 py-3">{r.arrival || "—"}</td><td className="px-4 py-3 text-xs text-[var(--soft)]">{r.updated || "—"}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="p-10 text-center text-sm text-[var(--soft)]">沒有符合的客戶資料。</div>}</div>
  </div>;
}

