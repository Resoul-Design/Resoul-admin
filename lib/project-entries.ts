// 專案收支明細：只計入連結至「有效（非測試、仍存在）」火化預約或紀念品訂單的項目
// 測試記錄、已刪除的預約或測試訂單上的收支不計入財務及總覽。
import { createAdminClient } from "@/lib/supabase/admin";

export type CountableEntry = { booking_id: string | null; order_ref: string | null; kind: string; amount: number; entry_date: string };

export async function loadCountableEntries(sinceDate?: string): Promise<CountableEntry[]> {
  const admin = createAdminClient();
  let q = admin.from("project_entries").select("booking_id, order_ref, kind, amount, entry_date").limit(10000);
  if (sinceDate) q = q.gte("entry_date", sinceDate);
  const res = await q;
  let data = res.data;
  if (res.error) {
    // 未執行 order_ref migration 時退回基本欄位
    let q2 = admin.from("project_entries").select("booking_id, kind, amount, entry_date").limit(10000);
    if (sinceDate) q2 = q2.gte("entry_date", sinceDate);
    const fb = await q2;
    data = (fb.data || []).map((e) => ({ ...e, order_ref: null })) as typeof data;
  }
  const entries = (data || []) as CountableEntry[];
  const bookingIds = [...new Set(entries.map((e) => e.booking_id).filter((v): v is string => !!v))];
  const orderRefs = [...new Set(entries.map((e) => e.order_ref).filter((v): v is string => !!v))];
  const [bk, po] = await Promise.all([
    bookingIds.length ? admin.from("cremation_bookings").select("id").in("id", bookingIds).eq("is_test", false) : Promise.resolve({ data: [] as { id: string }[] }),
    orderRefs.length ? admin.from("product_orders").select("shopify_order_id").in("shopify_order_id", orderRefs).eq("is_test", true) : Promise.resolve({ data: [] as { shopify_order_id: string }[] }),
  ]);
  const liveBookings = new Set((bk.data || []).map((b) => b.id));
  const testOrders = new Set((po.data || []).map((o) => o.shopify_order_id));
  return entries.filter((e) => (e.booking_id ? liveBookings.has(e.booking_id) : true) && !(e.order_ref && testOrders.has(e.order_ref)));
}
