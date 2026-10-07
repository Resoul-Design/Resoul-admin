"use client";

import { FollowUpPanel } from "../_follow-up-panel";
import { FollowUpBar } from "../_follow-up-bar";
import { FOLLOW_UP_ORDER, followAction, followLabel } from "@/lib/follow-up";
import type { FollowEntry } from "@/lib/follow-up-server";
import { csvCell } from "@/lib/csv";
import { Fragment, useMemo, useState } from "react";
import { EditBookingInline, type BookingData } from "./_edit";
import { WHATSAPP_CONFIRM, whatsappHref } from "./_whatsapp";
import { RowActions, type RowAction } from "../_row-actions";
import { TestFlagPanel } from "../_test-controls";
import { ProgressInline } from "./_progress";
import type { ProgressData } from "@/lib/booking-progress";

export type BookingRow = {
  id: string;
  isTest: boolean;
  created: string;
  invoiceNo: string;
  paymentRef?: string;
  serviceTime?: string;
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
  english: boolean;
  progress: ProgressData | null; // null：獸醫評估或未執行進度 migration
  followUp: FollowEntry | null; // 需要跟進時的資料（四類跟進）
  followWaiting: string | null; // 已提醒、等候期間的提示
};

const PAGE = 25;
const STATUS_FILTER = [
  { key: "all", label: "全部狀態" },
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "已接送" },
  { key: "cremating", label: "火化中" },
  { key: "ready", label: "可取回" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];
const SOURCE_FILTER = [
  { key: "all", label: "全部類別" },
  { key: "cremation", label: "火化預約" },
  { key: "vet", label: "獸醫評估／安辭查詢" },
];

// 「操作」視窗內的功能
function rowActions(r: BookingRow, staffName: string): RowAction[] {
  const list: RowAction[] = [];
  if (r.followUp) {
    const { item, kind } = r.followUp;
    list.push({
      kind: "panel",
      key: "followup",
      label: `🔔 ${followAction(item.entity, kind)}（${followLabel(item.entity, kind)}）`,
      title: "跟進",
      alert: true,
      node: <FollowUpPanel item={item} kind={kind} staffName={staffName} />,
    });
  }
  if (r.sourceKey === "cremation") {
    list.push({
      kind: "panel",
      key: "progress",
      label: `📍 更新進度（目前：${r.statusLabel}）`,
      title: "火化進度",
      alert: r.statusKey === "ready",
      node: (
        <ProgressInline
          id={r.id}
          owner={r.owner}
          petName={r.petName}
          contact={r.contact}
          status={r.statusKey}
          scheduledText={r.serviceDateTime}
          english={r.english}
          staffName={staffName}
          progress={r.progress}
        />
      ),
    });
  }
  const wa = whatsappHref(r.contact, r.waText);
  if (wa) list.push({ kind: "link", key: "wa", label: "💬 WhatsApp 客人", href: wa, whatsapp: true, confirm: WHATSAPP_CONFIRM });
  if (r.calUrl) list.push({ kind: "link", key: "cal", label: "📅 加入日曆", href: r.calUrl });
  if (r.shopifyOrderUrl) list.push({ kind: "link", key: "invoice", label: "🧾 發票（Shopify 訂單）", href: r.shopifyOrderUrl });
  list.push({ kind: "panel", key: "test", label: r.isTest ? "🧪 取消測試標記" : "🧪 標記為測試", title: "測試記錄", node: <TestFlagPanel entity={r.sourceKey} id={r.id} isTest={r.isTest} /> });
  list.push({ kind: "panel", key: "edit", label: "✏️ 編輯資料", title: "編輯預約", node: <EditBookingInline booking={r.booking} /> });
  return list;
}

export function BookingsTable({
  rows,
  paymentReady,
  sourceMode,
  initialQuery = "",
  staffName = "同事",
  followReady = true,
  initialOnlyFollow = false,
}: {
  rows: BookingRow[];
  paymentReady: boolean;
  sourceMode?: "cremation" | "vet";
  initialQuery?: string;
  staffName?: string;
  followReady?: boolean;
  initialOnlyFollow?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [onlyFollow, setOnlyFollow] = useState(initialOnlyFollow);
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
      if (onlyFollow && !r.followUp) return false;
      return true;
    }).sort((a, b) => onlyFollow ? FOLLOW_UP_ORDER.indexOf(a.followUp!.kind) - FOLLOW_UP_ORDER.indexOf(b.followUp!.kind) : 0);
  }, [rows, q, status, source, sourceMode, onlyFollow]);
  const followCount = rows.filter((r) => r.followUp && (!sourceMode || r.sourceKey === sourceMode)).length;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const reset = () => setPage(1);
  // 獸醫評估沒有方案，不顯示「方案」欄
  const showPlan = sourceMode !== "vet";

  function exportCsv() {
    const header = ["建立時間", "專案編號", "主人", "電話", "地點", "毛孩", "類型", "方案", "金額", "來源", "付款", "服務日期", "狀態"];
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

      <FollowUpBar ready={followReady} count={followCount} only={onlyFollow} onToggle={() => { setOnlyFollow((v) => !v); reset(); }} />

      <div className="mb-2 text-xs text-[var(--soft)]">共 {filtered.length} 筆{q || status !== "all" || (!sourceMode && source !== "all") ? "（已篩選）" : ""}</div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">沒有符合的預約。</div>
      ) : (
        <>
        {/* 欄位格式與「接送服務」一致；火化預約多一欄「方案」 */}
        <div className="hidden lg:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full min-w-[1300px] table-fixed text-sm">
            {showPlan ? (
              <colgroup><col className="w-[9%]"/><col className="w-[15%]"/><col className="w-[12%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[13%]"/><col className="w-[11%]"/><col className="w-[11%]"/><col className="w-[11%]"/></colgroup>
            ) : (
              <colgroup><col className="w-[10%]"/><col className="w-[17%]"/><col className="w-[13%]"/><col className="w-[9%]"/><col className="w-[15%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/></colgroup>
            )}
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium">建立時間</th>
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">主人 · 電話</th>
                <th className="px-4 py-3 font-medium">寵物</th>
                {showPlan && <th className="px-4 py-3 font-medium">方案</th>}
                <th className="px-4 py-3 font-medium">希望日期 · 時段</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium min-w-[88px]">狀態</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.id}>
                <tr className={"border-t border-[var(--line)] align-top" + (r.followUp ? " bg-amber-50/70" : "")}>
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">{r.created}</td>
                  <td className="px-4 py-3">
                    {r.invoiceNo ? (
                      <div className="min-w-0"><span className="font-medium text-[var(--gold)]">{r.invoiceNo}</span>{r.paymentRef && <div className="break-all text-xs text-[var(--soft)]">付款參考 {r.paymentRef}</div>}</div>
                    ) : (
                      <span className="text-[var(--faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{r.owner || "—"}</div>
                    <div className="text-[var(--soft)] text-xs mt-0.5">{r.contact ? "📞 " + r.contact : "—"}</div>
                  </td>
                  <td className="px-4 py-3"><div>{r.petName || "—"}</div><div className="text-[var(--soft)] text-xs">{r.petType}</div></td>
                  {showPlan && <td className="px-4 py-3 whitespace-nowrap">{r.plan || "—"}</td>}
                  <td className="px-3 py-3">
                    <div className="whitespace-nowrap">{r.serviceDate || "—"}</div>
                    {(r.serviceTime || r.timePref) && <div className="mt-0.5 text-xs leading-5 text-[var(--soft)]">{[r.serviceTime, r.timePref].filter(Boolean).join(" ")}</div>}
                  </td>
                  {/* 金額／付款／狀態同一行；操作掣放在第二行（與電話、時段同一行），操作合併為一個掣 */}
                  <td colSpan={3} className="py-3">
                    <div className="grid grid-cols-3">
                      <div className="px-4 whitespace-nowrap text-right tabular-nums">{r.amountText}</div>
                      <div className="px-4 whitespace-nowrap">{paymentReady ? <span className={"inline-block px-2 py-0.5 rounded-full text-xs " + r.paymentClass}>{r.paymentLabel}</span> : <span className="text-[var(--faint)] text-xs">待 migration</span>}</div>
                      <div className="px-4 whitespace-nowrap"><span className={"inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs " + r.statusClass}>{r.statusLabel}</span></div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-end gap-3 px-4">{r.followWaiting && <span className="text-xs text-[var(--soft)]">{r.followWaiting}</span>}<RowActions heading={r.owner || "—"} sub={r.invoiceNo} alertLabel={r.followUp ? followAction(r.followUp.item.entity, r.followUp.kind) : undefined} actions={rowActions(r, staffName)} /></div>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {shown.map((r) => (
            <div key={r.id} className={"rounded-2xl border p-4 " + (r.followUp ? "border-amber-300 bg-amber-50/70" : "border-[var(--line)] bg-[var(--card)]")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-xs text-[var(--soft)]">專案編號</div><div className="break-words font-medium text-[var(--gold)]">{r.invoiceNo || "（未有編號）"}</div></div>
                <span className={"px-2 py-0.5 rounded-full text-xs " + r.statusClass}>{r.statusLabel}</span>
              </div>
              {/* 卡片格式與「接送服務」一致：基本資料 → 日期／付款／金額灰底區 → 建立時間 → 操作 */}
              <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-[var(--soft)]">主人 · 電話</dt>
                <dd className="min-w-0"><div className="truncate">{r.owner || "—"}</div><div className="text-xs text-[var(--soft)]">{r.contact ? "📞 " + r.contact : "—"}</div></dd>
                <dt className="text-[var(--soft)]">寵物</dt>
                <dd className="min-w-0">{r.petName || "—"}{r.petType ? `（${r.petType}）` : ""}</dd>
                {r.plan && <>
                  <dt className="text-[var(--soft)]">方案</dt>
                  <dd className="min-w-0">{r.plan}</dd>
                </>}
              </dl>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl bg-[var(--head)] px-3 py-2.5 text-xs">
                <div className="col-span-2 min-w-0">
                  <div className="text-[var(--soft)]">希望日期 · 時段</div>
                  <div className="mt-0.5 font-medium text-sm text-[var(--ink)]">{[r.serviceDateTime, r.timePref].filter(Boolean).join(" ") || "—"}</div>
                </div>
                <div className="self-end">
                  {paymentReady && <span className={"inline-block px-2 py-0.5 rounded-full " + r.paymentClass}>{r.paymentLabel}</span>}
                </div>
                <div className="text-right">
                  <div className="text-[var(--soft)]">價錢</div>
                  <div className="mt-0.5 font-medium tabular-nums text-sm text-[var(--ink)]">{r.amountText || "—"}</div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 text-xs text-[var(--soft)]">
                <dt>建立時間</dt>
                <dd>{r.created || "—"}</dd>
              </dl>
              <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--line)] pt-3">
                {r.followWaiting && <span className="text-xs text-[var(--soft)]">{r.followWaiting}</span>}
                <RowActions heading={r.owner || "—"} sub={r.invoiceNo} alertLabel={r.followUp ? followAction(r.followUp.item.entity, r.followUp.kind) : undefined} actions={rowActions(r, staffName)} />
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
