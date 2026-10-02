"use client";

import { Fragment, useMemo, useState } from "react";

export type OrderRow = {
  id: string;
  orderName: string;
  projectNo: string;
  date: string;
  customer: string;
  phone: string;
  items: string;
  fin: string;
  finLabel: string;
  fulLabel: string;
  amount: number;
  currency: string;
  cancelled: boolean;
  printHref: string;
  whatsapp: string | null;
  editUrl: string;
};

const money = (n: number, c: string) => "$" + Number(n).toLocaleString() + " " + c;
const PAGE = 25;

// 付款／出貨標籤顏色（與接送服務一致）
function finClass(fin: string) {
  if (fin === "PAID") return "bg-green-100 text-green-800";
  if (fin === "REFUNDED" || fin === "PARTIALLY_REFUNDED" || fin === "VOIDED") return "bg-gray-200 text-gray-700";
  return "bg-amber-100 text-amber-800";
}
function fulClass(label: string) {
  if (label === "已出貨") return "bg-green-100 text-green-800";
  if (label === "未出貨") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

const STATUS_OPTS = [
  { key: "all", label: "全部" },
  { key: "cancelled", label: "已取消" },
  { key: "PAID", label: "已付款" },
  { key: "PENDING", label: "待付款" },
  { key: "REFUNDED", label: "已退款" },
  { key: "PARTIALLY_REFUNDED", label: "部分退款" },
];

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "cancelled" ? !r.cancelled : status !== "all" && (r.cancelled || r.fin !== status)) return false;
      if (!kw) return true;
      return (
        r.orderName.toLowerCase().includes(kw) ||
        r.projectNo.toLowerCase().includes(kw) ||
        r.customer.toLowerCase().includes(kw) ||
        r.phone.toLowerCase().includes(kw) ||
        r.items.toLowerCase().includes(kw)
      );
    });
  }, [rows, q, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);

  function exportCsv() {
    const header = ["訂單編號", "專案編號", "日期", "客戶", "電話", "內容", "付款", "出貨", "金額", "幣別", "已取消"];
    const lines = filtered.map((r) =>
      [r.orderName, r.projectNo, r.date, r.customer, r.phone, r.items, r.finLabel, r.fulLabel, r.amount, r.currency, r.cancelled ? "是" : ""]
        .map(csvCell)
        .join(",")
    );
    const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `resoul-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const onSearch = (v: string) => { setQ(v); setPage(1); };
  const onStatus = (v: string) => { setStatus(v); setPage(1); };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜尋訂單 / 專案編號 / 客戶 / 電話 / 產品…"
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        >
          {STATUS_OPTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={exportCsv} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">匯出 CSV</button>
      </div>

      <div className="mb-2 text-xs text-[var(--soft)]">共 {filtered.length} 張{q || status !== "all" ? "（已篩選）" : ""}</div>

      {/* 桌面表格：欄位格式與「接送服務」一致，操作放在第二行金額至出貨下方 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] md:block">
        <table className="w-full min-w-[1200px] table-fixed text-sm">
          <colgroup><col className="w-[10%]"/><col className="w-[14%]"/><col className="w-[13%]"/><col className="w-[27%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/></colgroup>
          <thead>
            <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
              <th className="px-4 py-3 font-medium">建立時間</th>
              <th className="px-4 py-3 font-medium">訂單編號</th>
              <th className="px-4 py-3 font-medium">客戶 · 電話</th>
              <th className="px-4 py-3 font-medium">內容</th>
              <th className="px-4 py-3 text-right font-medium">金額</th>
              <th className="px-4 py-3 font-medium">付款</th>
              <th className="px-4 py-3 font-medium">出貨</th>
            </tr>
          </thead>
          <tbody>{shown.map((r) => (
            <Fragment key={r.id}>
            <tr className={"border-t border-[var(--line)] align-top " + (r.cancelled ? "opacity-60" : "")}>
              <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{r.date}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-[var(--gold)]">{r.orderName}</span>
                {r.projectNo && r.projectNo !== "—" && r.projectNo !== r.orderName && <div className="break-all text-xs text-[var(--soft)]">專案 {r.projectNo}</div>}
              </td>
              <td className="px-4 py-3">
                <div className="break-words">{r.customer || "—"}</div>
                <div className="mt-0.5 text-xs text-[var(--soft)]">{r.phone ? "📞 " + r.phone : "—"}</div>
              </td>
              <td className="break-words px-4 py-3 text-[var(--soft)]">{r.items}</td>
              {/* 金額／付款／出貨同一行；操作掣放在第二行（與電話同一行） */}
              <td colSpan={3} className="py-3">
                <div className="grid grid-cols-3">
                  <div className="px-4 text-right whitespace-nowrap tabular-nums">{money(r.amount, r.currency)}</div>
                  <div className="px-4 whitespace-nowrap">
                    {r.cancelled
                      ? <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">已取消</span>
                      : <span className={"inline-block rounded-full px-2 py-0.5 text-xs " + finClass(r.fin)}>{r.finLabel}</span>}
                  </div>
                  <div className="px-4 whitespace-nowrap"><span className={"inline-block rounded-full px-2 py-0.5 text-xs " + fulClass(r.fulLabel)}>{r.fulLabel}</span></div>
                </div>
                <div className="mt-1.5 grid grid-cols-[7rem_3.25rem] items-center gap-x-2 whitespace-nowrap px-4">
                {r.cancelled ? <span className="text-xs text-[var(--faint)]">已取消</span> : <>
                  <div>{r.whatsapp && <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 hover:underline">💬 WhatsApp 客人</a>}</div>
                  <div><a href={r.editUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--cream)]">編輯</a></div>
                </>}
                </div>
              </td>
            </tr>
            </Fragment>
          ))}</tbody>
        </table>
      </div>

      {/* 手機卡片 */}
      <div className="space-y-3 md:hidden">{shown.map((r) => (
        <div key={r.id} className={"rounded-lg border border-[var(--line)] bg-[var(--card)] p-4 " + (r.cancelled ? "opacity-60" : "")}>
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.orderName}</span><span className="text-xs text-[var(--soft)]">{r.date}</span></div>
          {r.projectNo && r.projectNo !== "—" && r.projectNo !== r.orderName && <div className="mt-1 text-xs font-medium text-[var(--gold)]">專案：{r.projectNo}</div>}
          <div className="mt-1 text-sm">{r.customer || "—"}</div><div className="mt-1 break-words text-sm text-[var(--soft)]">{r.items}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {r.cancelled
              ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">已取消</span>
              : <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{r.finLabel}</span>}
            <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{r.fulLabel}</span>
            <span className="ml-auto font-medium">{money(r.amount, r.currency)}</span>
          </div>
          {!r.cancelled && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {r.whatsapp && <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-md border border-green-300 px-3 py-2 text-xs text-green-700">WhatsApp 客人</a>}
              <a href={r.editUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--line)] px-3 py-2 text-xs">編輯</a>
            </div>
          )}
        </div>
      ))}</div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">沒有符合的訂單。</div>
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
