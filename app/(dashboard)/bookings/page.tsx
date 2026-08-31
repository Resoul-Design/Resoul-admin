import { createClient } from "@/lib/supabase/server";
import { EditBookingButton, type BookingData } from "./_edit";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};

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
    .select(
      "id, case_no, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, status, notes, created_at"
    )
    .order("created_at", { ascending: false });

  const bookings = (data ?? []) as (BookingData & {
    created_at: string;
  })[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">預約火化記錄</h1>

      {error && (
        <div className="mb-4 text-sm text-red-600">
          讀取失敗：{error.message}
          <div className="text-[var(--soft)] mt-1">
            若提示欄位不存在，請先於 Supabase 執行 db/migration_booking_fields.sql。
          </div>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無預約記錄。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">收到</th>
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">主人 · 電話 · 地點</th>
                <th className="px-4 py-3 font-medium">毛孩</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium">服務日期</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">
                    {b.created_at?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {b.case_no ? (
                      <span className="font-medium text-[var(--gold)]">{b.case_no}</span>
                    ) : (
                      <span className="text-[var(--faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.owner_name || "—"}</div>
                    <div className="text-[var(--soft)] text-xs flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      {b.contact && <span>📞 {b.contact}</span>}
                      {b.pickup_address && <span>📍 {b.pickup_address}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.pet_name || "—"}</div>
                    <div className="text-[var(--soft)] text-xs">{b.pet_type || ""}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{b.plan || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {b.service_date || "—"}
                    {b.service_time && (
                      <span className="text-[var(--soft)]">
                        {" "}
                        {b.service_time.slice(0, 5)}
                      </span>
                    )}
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
                  <td className="px-4 py-3 text-right">
                    <EditBookingButton booking={b} />
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
