import { TestingNotice, WHATSAPP_CONFIRM } from "../_testing-notice";
import { waitingNote } from "@/lib/follow-up";
import { PageHeader } from "../_page-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain } from "@/lib/shopify";
import { getStaff, hasModule } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { NewBookingOrder } from "../_booking-order";
import { FOLLOW_UP_ACTION, FOLLOW_UP_LABEL, FOLLOW_UP_ORDER, followUpKind } from "@/lib/deposit-followup";
import { EditDepositInline } from "./_edit";
import { RowActions, type RowAction } from "../_row-actions";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { DepositsToolbar } from "./_toolbar";
import { FollowUpInline, type FollowUpItem } from "./_followup";
import { TestFlagPanel, TestRecordsBar } from "../_test-controls";

export const dynamic = "force-dynamic";

// 訂金訂單／安排預約接送。deposit_bookings 已啟用 RLS 且無 anon policy，
// 故以 service_role（createAdminClient）繞過 RLS 讀取。

type DepositRow = {
  id: string;
  is_test?: boolean | null;
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  pet_type: string | null;
  plan: string | null;
  service_date: string | null;
  service_time: string | null;
  pickup_address: string | null;
  notes: string | null;
  status: string;
  payment_ref: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  payment_currency: string | null;
  shopify_order_name: string | null;
  shopify_order_id: string | null;
  paid_at: string | null;
  reminded_at?: string | null;
  reminder_count?: number | null;
  follow_up_closed_at?: string | null;
  payment_link?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  contacted: "已聯絡",
  scheduled: "已排期",
  completed: "已完成",
  cancelled: "已取消",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  failed: "付款失敗",
  refunded: "已退款",
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "new":
      return "bg-amber-100 text-amber-800";
    case "contacted":
      return "bg-sky-100 text-sky-800";
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function paymentBadgeClass(status?: string | null) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-700";
    case "refunded":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function fmtCreated(iso?: string | null) {
  if (!iso) return "—";
  // ISO：2026-09-21T07:57:00+00:00 → 2026-09-21 07:57
  const s = iso.slice(0, 16).replace("T", " ");
  return s || "—";
}

function fmtAmount(row: DepositRow) {
  if (row.payment_amount == null) return "—";
  return (row.payment_currency || "HKD") + " " + Number(row.payment_amount).toLocaleString();
}

function serviceDateTime(row: DepositRow) {
  return [row.service_date || "", row.service_time || ""]
    .filter(Boolean)
    .join(" ");
}

function projectNo(row: DepositRow) {
  const match = (row.notes || "").match(/(?:專案編號|Project no\.)[：:]\s*([^｜|]+)/i);
  const notesNo = match?.[1]?.trim() || "";
  return notesNo && !/^(新專案|New project)$/i.test(notesNo) ? notesNo : "";
}

function calendarUrl(row: DepositRow) {
  if (!row.service_date) return null;
  const day = row.service_date.replace(/-/g, "");
  const times = Array.from((row.service_time || "").matchAll(/(\d{2}):(\d{2})/g));
  const hm = times[0] ? times[0][1] + times[0][2] : "1000";
  const endHm = times[1] ? times[1][1] + times[1][2] : String(Math.min(Number(hm.slice(0, 2)) + 2, 23)).padStart(2, "0") + hm.slice(2);
  const details = [`主人：${row.owner_name || "—"}`, `電話：${row.contact || "—"}`, `專案編號：${projectNo(row) || "—"}`, `付款參考：${row.payment_ref || "—"}`].join("\n");
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: `Resoul 接送服務 · ${row.pet_name || "毛孩"}`, dates: `${day}T${hm}00/${day}T${endHm}00`, details, location: row.pickup_address || "" }).toString();
}

function whatsappUrl(row: DepositRow) {
  const phone = (row.contact || "").replace(/\D/g, "");
  if (!phone) return null;
  const number = phone.startsWith("852") ? phone : `852${phone}`;
  const project = projectNo(row);
  const text = `你好，我哋係 RESOUL 🐾。已收到${row.pet_name || "毛孩"}嘅接送服務預約${project ? `（專案編號 ${project}）` : ""}。想同你確認接送時間同安排，請問方便嗎？`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// 「操作」視窗內的功能（有跟進事項時排第一）
function depositActions(r: DepositRow, fu: FollowUpItem | undefined, staffName: string, cal: string | null, invoice: string | null, wa: string | null): RowAction[] {
  const list: RowAction[] = [];
  if (fu) list.push({ kind: "panel", key: "followup", label: `🔔 ${FOLLOW_UP_ACTION[fu.kind]}（${FOLLOW_UP_LABEL[fu.kind]}）`, title: "訂金跟進", alert: true, node: <FollowUpInline item={fu} staffName={staffName} /> });
  if (wa) list.push({ kind: "link", key: "wa", label: "💬 WhatsApp 客人", href: wa, whatsapp: true, confirm: WHATSAPP_CONFIRM });
  if (cal) list.push({ kind: "link", key: "cal", label: "📅 加入日曆", href: cal });
  if (invoice) list.push({ kind: "link", key: "invoice", label: "🧾 發票（Shopify 訂單）", href: invoice });
  list.push({ kind: "panel", key: "test", label: r.is_test ? "🧪 取消測試標記" : "🧪 標記為測試", title: "測試記錄", node: <TestFlagPanel entity="deposit" id={r.id} isTest={!!r.is_test} /> });
  list.push({ kind: "panel", key: "edit", label: "✏️ 編輯資料", title: "編輯接送服務", node: <EditDepositInline booking={r} /> });
  return list;
}

export default async function DepositsPage({ searchParams }: { searchParams: Promise<{ followup?: string; q?: string; status?: string; test?: string }> }) {
  const { followup, q, status: statusParam, test } = await searchParams;
  const supabase = createAdminClient();
  const baseColumns =
    "id, created_at, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, notes, status, payment_ref, payment_status, payment_amount, payment_currency, shopify_order_name, shopify_order_id, paid_at, is_test";
  // 訂金跟進欄位需先執行 db/migration_deposit_followup.sql；未執行時退回原有欄位，列表照常顯示。
  const full = await supabase
    .from("deposit_bookings")
    .select(baseColumns + ", reminded_at, reminder_count, follow_up_closed_at, payment_link")
    .order("created_at", { ascending: false });
  let data = full.data as unknown as DepositRow[] | null;
  let error = full.error;
  const followUpNotReady = !!error && /reminded_at|reminder_count|follow_up_closed_at|payment_link/.test(error.message);
  if (followUpNotReady) {
    const base = await supabase.from("deposit_bookings").select(baseColumns).order("created_at", { ascending: false });
    data = base.data as unknown as DepositRow[] | null;
    error = base.error;
  }

  // 測試記錄預設隱藏；?test=1 只顯示測試記錄
  const allDeposits = data ?? [];
  const showTests = test === "1";
  const testCount = allDeposits.filter((r) => r.is_test).length;
  const rows = allDeposits.filter((r) => (showTests ? !!r.is_test : !r.is_test));
  const tableMissing = !!error && /deposit_bookings|does not exist|relation/i.test(error.message);
  const staff = await getStaff();
  const staffName = staff?.name?.trim() || staff?.email?.split("@")[0] || "同事";
  const depositCatalog = staff && hasModule(staff, ["deposits"]) ? await loadCatalog("deposit") : { products: [], error: "" };
  const now = new Date();
  const followUps: FollowUpItem[] = followUpNotReady
    ? []
    : rows
        .flatMap<FollowUpItem>((r) => {
          const kind = followUpKind(r, now);
          return kind ? [{ ...r, kind, projectNo: projectNo(r) }] : [];
        })
        .sort((a, b) => FOLLOW_UP_ORDER.indexOf(a.kind) - FOLLOW_UP_ORDER.indexOf(b.kind) || a.created_at.localeCompare(b.created_at));
  const followUpById = new Map(followUps.map((f) => [f.id, f]));
  // 已提醒、等候客人付款期間的提示
  const waitingFor = (r: DepositRow) =>
    !followUpNotReady && r.reminded_at && !r.follow_up_closed_at && !followUpById.has(r.id) &&
    !["cancelled", "completed"].includes(r.status) && !["paid", "refunded"].includes(r.payment_status || "pending")
      ? waitingNote(r.reminded_at)
      : null;
  // 「只顯示要跟進」：按跟進優先次序排列
  const onlyFollowUp = followup === "1" && !followUpNotReady;
  const listRows = onlyFollowUp ? followUps.map((f) => rows.find((r) => r.id === f.id)!).filter(Boolean) : rows;
  // 由全後台搜尋進入（?q=）：按主人、毛孩、專案編號、付款參考、電話篩選
  const query = (q || "").trim();
  const queryText = query.toLowerCase();
  const queryDigits = /^[\d\s()+-]{4,}$/.test(query) ? query.replace(/\D/g, "").replace(/^852(?=\d{8}$)/, "") : "";
  // 狀態篩選（?status=）：各狀態或「未付款」
  const statusFilter = statusParam && (STATUS_LABEL[statusParam] || statusParam === "unpaid") ? statusParam : "";
  const visibleRows = listRows.filter((r) => {
    if (statusFilter === "unpaid" ? r.payment_status === "paid" || r.status === "cancelled" : statusFilter && r.status !== statusFilter) return false;
    if (!query) return true;
    return [r.owner_name, r.pet_name, r.payment_ref, r.shopify_order_name, r.notes].some((v) => (v || "").toLowerCase().includes(queryText)) ||
      (!!queryDigits && (r.contact || "").replace(/\D/g, "").includes(queryDigits));
  });

  return (
    <div>
      <PageHeader title="接送服務">
        {staff && hasModule(staff, ["deposits"]) && <NewBookingOrder mode="deposit" products={depositCatalog.products} catalogError={depositCatalog.error} staffName={staffName} />}
      </PageHeader>

      <TestingNotice />

      {error && (
        <div className="mb-4 text-sm text-red-600">
          讀取失敗：{error.message}
          {tableMissing && (
            <div className="text-[var(--soft)] mt-1">
              若提示資料表不存在，請先於 Supabase（diyxcx）執行
              <code className="mx-1">supabase/deposit_bookings.sql</code>
              建立 <code className="mx-1">deposit_bookings</code> 表。
            </div>
          )}
        </div>
      )}

      {!error && (followUpNotReady ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未啟用訂金跟進：請先於 Supabase（diyxcx）執行 <code>db/migration_deposit_followup.sql</code>。
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm">
          <span>🔔 今日要跟進 <b className={followUps.length ? "text-amber-700" : ""}>{followUps.length}</b> 張</span>
          {onlyFollowUp ? (
            <Link href="/deposits" className="text-[var(--gold)] hover:underline">顯示全部</Link>
          ) : followUps.length > 0 && (
            <Link href="/deposits?followup=1" className="text-[var(--gold)] hover:underline">只顯示要跟進</Link>
          )}
          <span className="text-xs text-[var(--soft)]">需要跟進的訂金以淡黃色標示，按該行「🔔」掣處理。</span>
        </div>
      ))}

      <TestRecordsBar entity="deposit" count={testCount} showing={showTests} basePath="/deposits" canDelete={staff?.role === "admin"} />

      <Suspense fallback={null}>
        <DepositsToolbar query={query} status={statusFilter} />
      </Suspense>

      <div className="mb-2 text-xs text-[var(--soft)]">共 {visibleRows.length} 筆{query || statusFilter ? "（已篩選）" : ""}</div>

      {visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          {error ? "暫時無法顯示接送服務。" : query || statusFilter ? "沒有符合的記錄。" : "暫無接送服務記錄。"}
        </div>
      ) : (
        <>
          {/* 桌面：表格 */}
          <div className="hidden lg:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
            <table className="w-full min-w-[1300px] table-fixed text-sm">
              <colgroup><col className="w-[10%]"/><col className="w-[17%]"/><col className="w-[13%]"/><col className="w-[9%]"/><col className="w-[15%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/></colgroup>
              <thead>
                <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                  <th className="px-4 py-3 font-medium">建立時間</th>
                  <th className="px-4 py-3 font-medium">專案編號</th>
                  <th className="px-4 py-3 font-medium">主人 · 電話</th>
                  <th className="px-4 py-3 font-medium">寵物</th>
                  <th className="px-4 py-3 font-medium">希望日期 · 時段</th>
                  <th className="px-4 py-3 font-medium text-right">金額</th>
                  <th className="px-4 py-3 font-medium">付款</th>
                  <th className="px-4 py-3 font-medium min-w-[88px]">狀態</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const fu = followUpById.get(r.id);
                  const project = projectNo(r);
                  const cal = calendarUrl(r);
                  const wa = whatsappUrl(r);
                  const invoice = r.shopify_order_id ? `https://${shopDomain()}/admin/orders/${String(r.shopify_order_id).split("/").pop()}` : null;
                  return (
                    <Fragment key={r.id}>
                    <tr className={"border-t border-[var(--line)] align-top" + (fu ? " bg-amber-50/70" : "")}>
                      <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">{fmtCreated(r.created_at)}</td>
                      <td className="px-4 py-3">
                        {project ? (
                          <div className="min-w-0"><span className="font-medium text-[var(--gold)]">{project}</span>{r.payment_ref && <div className="break-all text-xs text-[var(--soft)]">付款參考 {r.payment_ref}</div>}</div>
                        ) : (
                          <span className="text-[var(--faint)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>{r.owner_name || "—"}</div>
                        <div className="text-[var(--soft)] text-xs mt-0.5">{r.contact ? "📞 " + r.contact : "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{r.pet_name || "—"}</div>
                        <div className="text-[var(--soft)] text-xs">{r.pet_type || ""}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="whitespace-nowrap">{r.service_date || "—"}</div>
                        {r.service_time && <div className="mt-0.5 text-xs leading-5 text-[var(--soft)]">{r.service_time}</div>}
                      </td>
                      {/* 金額／付款／狀態同一行；操作掣放在第二行，合併為一個「操作」掣 */}
                      <td colSpan={3} className="py-3">
                        <div className="grid grid-cols-3">
                          <div className="px-4 whitespace-nowrap text-right tabular-nums">{fmtAmount(r)}</div>
                          <div className="px-4 whitespace-nowrap">
                            <span className={"inline-block px-2 py-0.5 rounded-full text-xs " + paymentBadgeClass(r.payment_status)}>
                              {PAYMENT_LABEL[r.payment_status || "pending"] || r.payment_status || "待付款"}
                            </span>
                          </div>
                          <div className="px-4 whitespace-nowrap">
                            <span className={"inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs " + statusBadgeClass(r.status)}>
                              {STATUS_LABEL[r.status] || r.status}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-end gap-3 px-4">{waitingFor(r) && <span className="text-xs text-[var(--soft)]">{waitingFor(r)}</span>}<RowActions heading={r.owner_name || "—"} sub={project || undefined} alertLabel={fu ? FOLLOW_UP_ACTION[fu.kind] : undefined} actions={depositActions(r, fu, staffName, cal, invoice, wa)} /></div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 手機：卡片 */}
          <div className="space-y-3 lg:hidden">
            {visibleRows.map((r) => {
              const fu = followUpById.get(r.id);
              const project = projectNo(r);
              const cal = calendarUrl(r);
              const wa = whatsappUrl(r);
              const invoice = r.shopify_order_id ? `https://${shopDomain()}/admin/orders/${String(r.shopify_order_id).split("/").pop()}` : null;
              return (
                <div key={r.id} className={"rounded-2xl border p-4 " + (fu ? "border-amber-300 bg-amber-50/70" : "border-[var(--line)] bg-[var(--card)]")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="text-xs text-[var(--soft)]">專案編號</div><div className="break-words font-medium text-[var(--gold)]">{project || "（舊記錄未有專案編號）"}</div></div>
                    <span className={"px-2 py-0.5 rounded-full text-xs " + statusBadgeClass(r.status)}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-[var(--soft)]">主人 · 電話</dt>
                    <dd className="min-w-0"><div className="truncate">{r.owner_name || "—"}</div><div className="text-xs text-[var(--soft)]">{r.contact ? "📞 " + r.contact : "—"}</div></dd>
                    <dt className="text-[var(--soft)]">寵物</dt>
                    <dd className="min-w-0">{r.pet_name || "—"}{r.pet_type ? `（${r.pet_type}）` : ""}</dd>
                    {r.payment_ref && <>
                      <dt className="text-[var(--soft)]">付款參考</dt>
                      <dd className="min-w-0 break-all text-xs text-[var(--soft)]">{r.payment_ref}</dd>
                    </>}
                  </dl>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl bg-[var(--head)] px-3 py-2.5 text-xs">
                    <div className="col-span-2 min-w-0">
                      <div className="text-[var(--soft)]">希望日期 · 時段</div>
                      <div className="mt-0.5 font-medium text-sm text-[var(--ink)]">{serviceDateTime(r) || "—"}</div>
                    </div>
                    <div className="self-end">
                      <span className={"inline-block px-2 py-0.5 rounded-full " + paymentBadgeClass(r.payment_status)}>
                        {PAYMENT_LABEL[r.payment_status || "pending"] || r.payment_status || "待付款"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--soft)]">接送訂金</div>
                      <div className="mt-0.5 font-medium tabular-nums text-sm text-[var(--ink)]">{fmtAmount(r)}</div>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] [&>dt]:whitespace-nowrap gap-x-3 text-xs text-[var(--soft)]">
                    <dt>建立時間</dt>
                    <dd>{fmtCreated(r.created_at)}</dd>
                  </dl>
                  <div className="mt-3 flex items-center justify-end gap-3 border-t border-[var(--line)] pt-3">
                {waitingFor(r) && <span className="text-xs text-[var(--soft)]">{waitingFor(r)}</span>}
                    <RowActions heading={r.owner_name || "—"} sub={project || undefined} alertLabel={fu ? FOLLOW_UP_ACTION[fu.kind] : undefined} actions={depositActions(r, fu, staffName, cal, invoice, wa)} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
