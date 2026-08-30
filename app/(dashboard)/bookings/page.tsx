import { createClient } from "@/lib/supabase/server";
import { updateBookingStatus } from "./actions";

export const dynamic = "force-dynamic";

type Booking = {
  id: string;
  created_at: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  pet_type: string | null;
  plan: string | null;
  service_date: string | null;
  pickup_address: string | null;
  status: string;
  source: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_ORDER = [
  "new",
  "scheduled",
  "pickup",
  "cremating",
  "completed",
  "cancelled",
];

function badgeClass(status: string) {
  switch (status) {
    case "new":
      return "bg-amber-100 text-amber-800";
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "pickup":
    case "cremating":
      return "bg-violet-100 text-violet-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cremation_bookings")
    .select("*")
    .order("created_at", { ascending: false });

  const bookings = (data ?? []) as Booking[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">預約火化記錄</h1>

      {error && (
        <div className="mb-4 text-sm text-red-600">
          讀取失敗：{error.message}（請確認已執行 db/schema.sql）
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無預約記錄。由網站送出的預約，或由 Google Sheet 匯入的資料，會顯示於此。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">收到</th>
                <th className="px-4 py-3 font-medium">主人 / 聯絡</th>
                <th className="px-4 py-3 font-medium">毛孩</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium">服務日期</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">更新</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">
                    {b.created_at?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.owner_name || "—"}</div>
                    <div className="text-[var(--soft)]">{b.contact || ""}</div>
                    {b.pickup_address && (
                      <div className="text-xs text-[var(--soft)] mt-1">
                        📍 {b.pickup_address}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.pet_name || "—"}</div>
                    <div className="text-[var(--soft)]">{b.pet_type || ""}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{b.plan || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {b.service_date || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-block px-2 py-0.5 rounded-full text-xs " +
                        badgeClass(b.status)
                      }
                    >
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <form action={updateBookingStatus} className="flex gap-1.5">
                      <input type="hidden" name="id" value={b.id} />
                      <select
                        name="status"
                        defaultValue={b.status}
                        className="text-xs border border-[var(--line)] rounded-md px-2 py-1 bg-white"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button className="text-xs px-2 py-1 rounded-md bg-[var(--gold)] text-white hover:opacity-90">
                        存
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
