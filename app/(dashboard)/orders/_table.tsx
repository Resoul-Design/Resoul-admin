"use client";

import { displayPhone } from "@/lib/phone-display";
import { FollowUpPanel } from "../_follow-up-panel";
import { FollowUpBar } from "../_follow-up-bar";
import { FOLLOW_UP_ORDER, followAction, followLabel } from "@/lib/follow-up";
import type { FollowEntry } from "@/lib/follow-up-server";
import { WHATSAPP_CONFIRM } from "../_testing-notice";
import { csvCell } from "@/lib/csv";
import { Fragment, useMemo, useState } from "react";
import { matchesInvoice } from "@/lib/invoice-search";
import { RowActions, type RowAction } from "../_row-actions";
import { TestFlagPanel } from "../_test-controls";
import { LinkProjectPanel } from "./_link-project";
import { DepositCreditPanel } from "../_deposit-credit";
import { MEMORIAL_STATUSES, memorialClass } from "@/lib/memorial-status";
import { MemorialStatusSelect } from "./_memorial-status";

export type OrderRow = {
  id: string;
  isTest?: boolean;
  orderName: string; // Shopify 訂單號（只作搜尋及內部參考）
  invoiceNo: string; // 公司單號（對外）
  projectNo: string;
  date: string;
  customer: string;
  phone: string;
  items: string;
  fin: string;
  finLabel: string;
  fulLabel: string; // 產品狀態（已訂購／待交付／已完成，草稿顯示「草稿」）
  memorial?: string; // 可修改的產品狀態值；草稿及已取消的單沒有
  amount: number;
  currency: string;
  cancelled: boolean;
  printHref: string;
  whatsapp: string | null;
  editUrl: string;
  invoiceUrl?: string; // 有值＝未付款的 Shopify 草稿訂單
  followUp?: FollowEntry | null; // 需要跟進時的資料（四類跟進）
  followWaiting?: string | null; // 已提醒、等候期間的提示
};

// 「操作」視窗內的功能（與接送服務、火化預約一致）
function rowActions(r: OrderRow, staffName: string): RowAction[] {
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
  if (r.whatsapp && !r.cancelled) list.push({ kind: "link", key: "wa", label: r.invoiceUrl ? "💬 WhatsApp 傳付款連結" : "💬 WhatsApp 客人", href: r.whatsapp, whatsapp: true, confirm: WHATSAPP_CONFIRM });
  if (r.invoiceUrl) list.push({ kind: "link", key: "pay", label: "💳 開啟付款頁", href: r.invoiceUrl });
  if (r.invoiceUrl && !r.cancelled) list.push({ kind: "panel", key: "credit", label: "💰 套用接送訂金", title: "接送訂金抵扣", node: <DepositCreditPanel target={{ kind: "draft", id: r.id }} /> });
  if (r.printHref) {
    list.push({ kind: "link", key: "invoice", label: "🧾 發票 PDF", href: r.printHref });
    list.push({ kind: "link", key: "invoice-word", label: "📝 發票 Word", href: r.printHref.replace("/print/invoices?", "/print/invoices/word?") });
  }
  if (!r.invoiceUrl) list.push({ kind: "panel", key: "project", label: "🔗 連結專案", title: "連結專案", node: <LinkProjectPanel orderId={r.id} current={r.projectNo} /> });
  if (!r.invoiceUrl) list.push({ kind: "panel", key: "test", label: r.isTest ? "🧪 取消測試標記" : "🧪 標記為測試", title: "測試記錄", node: <TestFlagPanel entity="order" id={r.id} isTest={!!r.isTest} /> });
  list.push({ kind: "link", key: "edit", label: r.invoiceUrl ? "✏️ 編輯（開啟 Shopify 草稿）" : "✏️ 編輯（開啟 Shopify 訂單）", href: r.editUrl });
  return list;
}

const money = (n: number, c: string) => "$" + Number(n).toLocaleString() + " " + c;
const PAGE = 25;

// 付款／出貨標籤顏色（與接送服務一致）
function finClass(fin: string) {
  if (fin === "PAID") return "bg-green-100 text-green-800";
  if (fin === "REFUNDED" || fin === "PARTIALLY_REFUNDED" || fin === "VOIDED") return "bg-gray-200 text-gray-700";
  return "bg-amber-100 text-amber-800";
}
const fulClass = memorialClass;

const STATUS_OPTS = [
  { key: "all", label: "全部" },
  { key: "cancelled", label: "已取消" },
  { key: "PAID", label: "已付款" },
  { key: "PENDING", label: "待付款" },
  { key: "REFUNDED", label: "已退款" },
  { key: "PARTIALLY_REFUNDED", label: "部分退款" },
];

export function OrdersTable({ rows, initialQuery = "", staffName = "同事", followReady = true, initialOnlyFollow = false }: { rows: OrderRow[]; initialQuery?: string; staffName?: string; followReady?: boolean; initialOnlyFollow?: boolean }) {
  const [q, setQ] = useState(initialQuery);
  const [onlyFollow, setOnlyFollow] = useState(initialOnlyFollow);
  const [status, setStatus] = useState("all");
  const [productStatus, setProductStatus] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "cancelled" ? !r.cancelled : status !== "all" && (r.cancelled || r.fin !== status)) return false;
      if (productStatus !== "all" && r.fulLabel !== productStatus) return false;
      if (onlyFollow && !r.followUp) return false;
      if (!kw) return true;
      return (
        matchesInvoice(kw, r.invoiceNo) ||
        r.invoiceNo.includes(kw) ||
        r.orderName.toLowerCase().includes(kw) ||
        r.projectNo.toLowerCase().includes(kw) ||
        r.customer.toLowerCase().includes(kw) ||
        r.phone.toLowerCase().includes(kw) ||
        r.items.toLowerCase().includes(kw)
      );
    }).sort((a, b) => onlyFollow ? FOLLOW_UP_ORDER.indexOf(a.followUp!.kind) - FOLLOW_UP_ORDER.indexOf(b.followUp!.kind) : 0);
  }, [rows, q, status, productStatus, onlyFollow]);
  const followCount = rows.filter((r) => r.followUp).length;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);

  function exportCsv() {
    const header = ["單號", "專案編號", "日期", "客戶", "電話", "內容", "付款", "產品狀態", "金額", "幣別", "已取消"];
    const lines = filtered.map((r) =>
      [r.invoiceNo, r.projectNo, r.date, r.customer, r.phone, r.items, r.finLabel, r.fulLabel, r.amount, r.currency, r.cancelled ? "是" : ""]
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
          placeholder="搜尋單號 / 專案編號 / 客戶 / 電話 / 產品…"
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        >
          {STATUS_OPTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={productStatus} onChange={(e) => { setProductStatus(e.target.value); setPage(1); }} aria-label="產品狀態篩選" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]">
          <option value="all">全部產品狀態</option>
          {MEMORIAL_STATUSES.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
        </select>
        <button onClick={exportCsv} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--cream)]">匯出 CSV</button>
      </div>

      <FollowUpBar ready={followReady} count={followCount} only={onlyFollow} onToggle={() => { setOnlyFollow((v) => !v); setPage(1); }} />

      <div className="mb-2 text-xs text-[var(--soft)]">共 {filtered.length} 張{q || status !== "all" || productStatus !== "all" ? "（已篩選）" : ""}</div>

      {/* 桌面表格：欄位格式與「接送服務」一致，操作放在第二行金額至出貨下方 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] lg:block">
        <table className="w-full min-w-[1200px] table-fixed text-sm">
          <colgroup><col className="w-[10%]"/><col className="w-[14%]"/><col className="w-[13%]"/><col className="w-[27%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/></colgroup>
          <thead>
            <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
              <th className="px-4 py-3 font-medium">建立時間</th>
              <th className="px-4 py-3 font-medium">單號</th>
              <th className="px-4 py-3 font-medium">客戶 · 電話</th>
              <th className="px-4 py-3 font-medium">內容</th>
              <th className="px-4 py-3 text-right font-medium">金額</th>
              <th className="px-4 py-3 font-medium">付款</th>
              <th className="px-4 py-3 font-medium">產品狀態</th>
            </tr>
          </thead>
          <tbody>{shown.map((r) => (
            <Fragment key={r.id}>
            <tr className={"border-t border-[var(--line)] align-top " + (r.cancelled ? "opacity-60" : "") + (r.followUp ? " bg-amber-50/70" : "")}>
              <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{r.date}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-[var(--gold)]">{r.invoiceNo ? `單號 ${r.invoiceNo}` : r.invoiceUrl ? "草稿（未有單號）" : "未有單號"}</span>
                {r.projectNo && r.projectNo !== "—" && r.projectNo !== r.invoiceNo && <div className="break-all text-xs text-[var(--soft)]">專案 {r.projectNo}</div>}
              </td>
              <td className="px-4 py-3">
                <div className="break-words">{r.customer || "—"}</div>
                <div className="mt-0.5 text-xs text-[var(--soft)]">{r.phone ? "📞 " + displayPhone(r.phone) : "—"}</div>
              </td>
              <td className="break-words px-4 py-3 text-[var(--soft)]">{r.items}</td>
              {/* 金額／付款／出貨同一行；操作掣放在第二行，合併為一個「操作」掣 */}
              <td colSpan={3} className="py-3">
                <div className="grid grid-cols-3">
                  <div className="px-4 text-right whitespace-nowrap tabular-nums">{money(r.amount, r.currency)}</div>
                  <div className="px-4 whitespace-nowrap">
                    {r.cancelled
                      ? <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">已取消</span>
                      : <span className={"inline-block rounded-full px-2 py-0.5 text-xs " + finClass(r.fin)}>{r.finLabel}</span>}
                  </div>
                  <div className="px-4 whitespace-nowrap">{r.memorial ? <MemorialStatusSelect key={r.memorial} orderId={r.id} value={r.memorial} /> : <span className={"inline-block rounded-full px-2 py-0.5 text-xs " + fulClass(r.fulLabel)}>{r.fulLabel}</span>}</div>
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-3 px-4">{r.followWaiting && <span className="text-xs text-[var(--soft)]">{r.followWaiting}</span>}<RowActions heading={r.customer || "—"} sub={r.orderName} alertLabel={r.followUp ? followAction(r.followUp.item.entity, r.followUp.kind) : undefined} actions={rowActions(r, staffName)} /></div>
              </td>
            </tr>
            </Fragment>
          ))}</tbody>
        </table>
      </div>

      {/* 手機卡片：格式與接送服務一致（編號 → 基本資料 → 付款／金額灰底區 → 建立時間 → 操作） */}
      <div className="space-y-3 lg:hidden">{shown.map((r) => (
        <div key={r.id} className={"rounded-2xl border p-4 " + (r.followUp ? "border-amber-300 bg-amber-50/70 " : "border-[var(--line)] bg-[var(--card)] ") + (r.cancelled ? "opacity-60" : "")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="text-xs text-[var(--soft)]">單號</div><div className="break-words font-medium text-[var(--gold)]">{r.invoiceNo || "—"}</div></div>
            {r.memorial ? <MemorialStatusSelect key={r.memorial} orderId={r.id} value={r.memorial} /> : <span className={"whitespace-nowrap rounded-full px-2 py-0.5 text-xs " + fulClass(r.fulLabel)}>{r.fulLabel}</span>}
          </div>
          <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-[var(--soft)]">客戶 · 電話</dt>
            <dd className="min-w-0"><div className="truncate">{r.customer || "—"}</div><div className="text-xs text-[var(--soft)]">{r.phone ? "📞 " + displayPhone(r.phone) : "—"}</div></dd>
            {r.projectNo && r.projectNo !== "—" && <>
              <dt className="text-[var(--soft)]">專案編號</dt>
              <dd className="min-w-0 break-all text-xs text-[var(--soft)]">{r.projectNo}</dd>
            </>}
            <dt className="text-[var(--soft)]">內容</dt>
            <dd className="min-w-0 break-words">{r.items || "—"}</dd>
          </dl>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-xl bg-[var(--head)] px-3 py-2.5 text-xs">
            <div className="self-end">
              {r.cancelled
                ? <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-red-700">已取消</span>
                : <span className={"inline-block rounded-full px-2 py-0.5 " + finClass(r.fin)}>{r.finLabel}</span>}
            </div>
            <div className="text-right">
              <div className="text-[var(--soft)]">金額</div>
              <div className="mt-0.5 font-medium tabular-nums text-sm text-[var(--ink)]">{money(r.amount, r.currency)}</div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 text-xs text-[var(--soft)]">
            <dt>建立時間</dt>
            <dd>{r.date || "—"}</dd>
          </dl>
          <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--line)] pt-3">
                {r.followWaiting && <span className="text-xs text-[var(--soft)]">{r.followWaiting}</span>}
            <RowActions heading={r.customer || "—"} sub={r.orderName} alertLabel={r.followUp ? followAction(r.followUp.item.entity, r.followUp.kind) : undefined} actions={rowActions(r, staffName)} />
          </div>
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
