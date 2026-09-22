"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProjectRow = {
  key: string;
  href: string;
  projectNo: string;
  primary: string;
  secondary: string;
  plan: string;
  status: string;
  kind: "pickup" | "cremation" | "product";
  income: number;
  expense: number;
  date: string;
};

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const PAGE = 25;

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).filter(Boolean), [rows]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!kw) return true;
      return (
        r.projectNo.toLowerCase().includes(kw) ||
        r.primary.toLowerCase().includes(kw) ||
        r.secondary.toLowerCase().includes(kw) ||
        r.plan.toLowerCase().includes(kw)
      );
    });
  }, [rows, q, kind, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const reset = () => setPage(1);

  function exportCsv() {
    const header = ["專案編號", "名稱", "主人／內容", "類別", "狀態", "收入", "支出", "淨額"];
    const lines = filtered.map((r) =>
      [r.projectNo, r.primary, r.secondary, r.plan, r.status, r.income, r.expense, r.income - r.expense].map(csvCell).join(",")
    );
    const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `resoul-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); reset(); }}
          placeholder="搜尋 專案編號 / 名稱 / 主人 / 方案…"
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        <select value={kind} onChange={(e) => { setKind(e.target.value); reset(); }} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]">
          <option value="all">全部類別</option>
          <option value="pickup">接送服務</option>
          <option value="cremation">火化</option>
          <option value="product">紀念產品</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]">
          <option value="all">全部狀態</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={exportCsv} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">匯出 CSV</button>
      </div>

      <div className="mb-2 text-xs text-[var(--soft)]">共 {filtered.length} 個{q || kind !== "all" || status !== "all" ? "（已篩選）" : ""}</div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">沒有符合的專案。</div>
      ) : (
        <><div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">名稱</th>
                <th className="px-4 py-3 font-medium">主人／內容</th>
                <th className="px-4 py-3 font-medium">類別</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">收入</th>
                <th className="px-4 py-3 font-medium text-right">支出</th>
                <th className="px-4 py-3 font-medium text-right">淨額</th>
                <th className="px-4 py-3 font-medium text-right">明細</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--gold)]">{r.projectNo}</td>
                  <td className="px-4 py-3">{r.primary}</td>
                  <td className="px-4 py-3 text-[var(--soft)]">{r.secondary}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{r.plan}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--soft)]">{money(r.expense)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.income - r.expense)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={r.href} className="text-xs text-[var(--gold)] hover:underline">管理 →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {shown.map((r) => (
            <Link key={r.key} href={r.href} className="block rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--gold)]">{r.projectNo}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">{r.status}</span>
              </div>
              <div className="mt-1 text-sm">{r.primary}{r.secondary ? `　·　${r.secondary}` : ""}</div>
              <div className="mt-0.5 text-xs text-[var(--soft)]">{r.plan}</div>
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span>收入 <span className="tabular-nums">{money(r.income)}</span></span>
                <span className="text-[var(--soft)]">支出 <span className="tabular-nums">{money(r.expense)}</span></span>
                <span className="ml-auto font-medium">淨額 <span className="tabular-nums">{money(r.income - r.expense)}</span></span>
              </div>
            </Link>
          ))}
        </div>
        </>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button onClick={() => setPage(cur - 1)} disabled={cur <= 1} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40 hover:bg-[var(--cream)]">← 上一頁</button>
          <span className="text-[var(--soft)]">第 {cur} / {pages} 頁</span>
          <button onClick={() => setPage(cur + 1)} disabled={cur >= pages} className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40 hover:bg-[var(--cream)]">下一頁 →</button>
        </div>
      )}
    </div>
  );
}
