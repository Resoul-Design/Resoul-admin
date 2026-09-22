"use client";

import { useMemo, useState } from "react";
import { EditBookingButton, type BookingData } from "./_edit";
import { WhatsAppButton } from "./_whatsapp";

export type BookingRow = {
  id: string;
  created: string;
  invoiceNo: string;
  owner: string;
  contact: string;
  address: string;
  petName: string;
  petType: string;
  plan: string;
  amountText: string;
  sourceKey: "cremation" | "vet";
  sourceLabel: string;
  statusKey: string;
  statusLabel: string;
  statusClass: string;
  paymentLabel: string;
  paymentClass: string;
  serviceDate: string;
  serviceDateTime: string;
  timePref: string;
  calUrl: string | null;
  waText: string;
  search: string;
  shopifyOrderUrl: string | null;
  booking: BookingData & { created_at: string; notes?: string | null };
};

const PAGE = 25;
const STATUS_FILTER = [
  { key: "all", label: "全部狀態" },
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "接送中" },
  { key: "cremating", label: "火化中" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];
const SOURCE_FILTER = [
  { key: "all", label: "全部類別" },
  { key: "cremation", label: "火化預約" },
  { key: "vet", label: "獸醫評估／安辭查詢" },
];

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BookingsTable({
  rows,
  paymentReady,
  sourceMode,
}: {
  rows: BookingRow[];
  paymentReady: boolean;
  sourceMode?: "cremation" | "vet";
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.statusKey !== status) return false;
      if (sourceMode && r.sourceKey !== sourceMode) return false;
      if (!sourceMode && source !== "all" && r.sourceKey !== source) return false;
      if (kw && !r.search.includes(kw)) return false;
      return true;
    });
  }, [rows, q, status, source, sourceMode]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const reset = () => setPage(1);

  function exportCsv() {
    const header = ["收到", "專案編號", "主人", "電話", "地點", "毛孩", "類型", "方案", "金額", "來源", "付款", "服務日期", "狀態"];
    const lines = filtered.map((r) =>
      [r.created, r.invoiceNo, r.owner, r.contact, r.address, r.petName, r.petType, r.plan, r.amountText, r.sourceLabel, r.paymentLabel, r.serviceDate, r.statusLabel]
        .map(csvCell).join(",")
    );
    const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `resoul-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); reset(); }}
          placeholder="搜尋 主人 / 電話 / 毛孩 / 專案編號…"
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        {!sourceMode && (
          <select value={source} onChange={(e) => { setSource(e.target.value); reset(); }} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]">
            {SOURCE_FILTER.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]">
          {STATUS_FILTER.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={exportCsv} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">匯出 CSV</button>
      </div>

      <div className="mb-2 text-xs text-[var(--soft)]">共 {filtered.length} 筆{q || status !== "all" || (!sourceMode && source !== "all") ? "（已篩選）" : ""}</div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">沒有符合的預約。</div>
      ) : (
        <><div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium">收到</th>
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">主人 · 電話</th>
                <th className="px-4 py-3 font-medium">毛孩</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium text-right">價錢</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium">服務日期 · 希望時段</th>
                <th className="px-4 py-3 font-medium min-w-[88px]">狀態</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">{r.created}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.invoiceNo ? <span className="font-medium text-[var(--gold)]">{r.invoiceNo}</span> : <span className="text-[var(--faint)]">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{r.owner || "—"}</div>
                    <div className="text-[var(--soft)] text-xs mt-0.5">{r.contact ? "📞 " + r.contact : "—"}</div>
                  </td>
                  <td className="px-4 py-3"><div>{r.petName || "—"}</div><div className="text-[var(--soft)] text-xs">{r.petType}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.plan || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">{r.amountText}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{paymentReady ? <span className={"inline-block px-2 py-0.5 rounded-full text-xs " + r.paymentClass}>{r.paymentLabel}</span> : <span className="text-[var(--faint)] text-xs">待 migration</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{r.serviceDateTime || "—"}</div>
                    {r.timePref && <div className="text-xs text-[var(--soft)]">{r.timePref}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={"inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs " + r.statusClass}>{r.statusLabel}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                      {r.calUrl && <a href={r.calUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">📅 加入日曆</a>}
                      {r.shopifyOrderUrl && <a href={r.shopifyOrderUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">發票</a>}
                      <WhatsAppButton phone={r.contact} text={r.waText} />
                      <EditBookingButton booking={r.booking} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {shown.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--gold)]">{r.invoiceNo || "（未有編號）"}</span>
                <span className={"px-2 py-0.5 rounded-full text-xs " + r.statusClass}>{r.statusLabel}</span>
              </div>
              <div className="mt-1 text-sm">{r.owner || "—"}　·　{r.petName || "—"}{r.petType ? `（${r.petType}）` : ""}</div>
              <div className="mt-0.5 text-xs text-[var(--soft)]">{r.plan || "—"}{r.contact ? "　·　📞 " + r.contact : ""}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>{r.serviceDateTime || "—"}{r.timePref ? "　·　" + r.timePref : ""}</span>
                {paymentReady && <span className={"px-2 py-0.5 rounded-full " + r.paymentClass}>{r.paymentLabel}</span>}
                <span className="ml-auto font-medium tabular-nums">{r.amountText}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
                {r.calUrl && <a href={r.calUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">📅 加入日曆</a>}
                {r.shopifyOrderUrl && <a href={r.shopifyOrderUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">發票</a>}
                <WhatsAppButton phone={r.contact} text={r.waText} />
                <EditBookingButton booking={r.booking} />
              </div>
            </div>
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
