import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain } from "@/lib/shopify";
import { EditDepositButton } from "./_edit";

export const dynamic = "force-dynamic";

// 訂金訂單／安排預約接送。deposit_bookings 已啟用 RLS 且無 anon policy，
// 故以 service_role（createAdminClient）繞過 RLS 讀取。

type DepositRow = {
  id: string;
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

export default async function DepositsPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("deposit_bookings")
    .select(
      "id, created_at, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, notes, status, payment_ref, payment_status, payment_amount, payment_currency, shopify_order_name, shopify_order_id, paid_at"
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as DepositRow[];
  const tableMissing = !!error && /deposit_bookings|does not exist|relation/i.test(error.message);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">接送服務</h1>

      <div className="mt-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        測試期間：「💬 WhatsApp 客人」只會開啟預填訊息草稿，<b>請勿按下傳送鍵，或向客人發送任何訊息</b>。
      </div>

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

      <div className="mb-2 text-xs text-[var(--soft)]">共 {rows.length} 筆</div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          {error ? "暫時無法顯示接送服務。" : "暫無接送服務記錄。"}
        </div>
      ) : (
        <>
          {/* 桌面：表格 */}
          <div className="hidden lg:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <colgroup><col className="w-[9%]"/><col className="w-[14%]"/><col className="w-[12%]"/><col className="w-[7%]"/><col className="w-[15%]"/><col className="w-[8%]"/><col className="w-[7%]"/><col className="w-[7%]"/><col className="w-[21%]"/></colgroup>
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
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const project = projectNo(r);
                  const cal = calendarUrl(r);
                  const wa = whatsappUrl(r);
                  const invoice = r.shopify_order_id ? `https://${shopDomain()}/admin/orders/${String(r.shopify_order_id).split("/").pop()}` : null;
                  return (
                    <tr key={r.id} className="border-t border-[var(--line)] align-top">
                      <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">{fmtCreated(r.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {project ? (
                          <div><span className="font-medium text-[var(--gold)]">{project}</span>{r.payment_ref && <div className="text-xs text-[var(--soft)]">付款參考 {r.payment_ref}</div>}</div>
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
                      <td className="px-4 py-3 whitespace-nowrap">{serviceDateTime(r) || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">{fmtAmount(r)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={"inline-block px-2 py-0.5 rounded-full text-xs " + paymentBadgeClass(r.payment_status)}>
                          {PAYMENT_LABEL[r.payment_status || "pending"] || r.payment_status || "待付款"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={"inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs " + statusBadgeClass(r.status)}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3"><div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        {cal && <a href={cal} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">📅 加入日曆</a>}
                        {invoice && <a href={invoice} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)] hover:underline">發票</a>}
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 hover:underline">💬 WhatsApp 客人</a>}
                        <EditDepositButton booking={r}/>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 手機：卡片 */}
          <div className="space-y-3 lg:hidden">
            {rows.map((r) => {
              const project = projectNo(r);
              const cal = calendarUrl(r);
              const wa = whatsappUrl(r);
              const invoice = r.shopify_order_id ? `https://${shopDomain()}/admin/orders/${String(r.shopify_order_id).split("/").pop()}` : null;
              return (
                <div key={r.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="text-xs text-[var(--soft)]">專案編號</div><div className="break-words font-medium text-[var(--gold)]">{project || "（舊記錄未有專案編號）"}</div></div>
                    <span className={"px-2 py-0.5 rounded-full text-xs " + statusBadgeClass(r.status)}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-[var(--soft)]">主人 · 電話</dt>
                    <dd className="min-w-0">{r.owner_name || "—"}<div className="text-xs text-[var(--soft)]">{r.contact ? "📞 " + r.contact : "—"}</div></dd>
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
                  <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 text-xs text-[var(--soft)]">
                    <dt>建立時間</dt>
                    <dd>{fmtCreated(r.created_at)}</dd>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
                    {cal && <a href={cal} className="text-xs text-[var(--gold)]">📅 加入日曆</a>}
                    {invoice && <a href={invoice} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--gold)]">發票</a>}
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700">💬 WhatsApp 客人</a>}
                    <EditDepositButton booking={r}/>
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
