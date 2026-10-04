import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { ProjectLedger, loadEntries } from "../../_ledger";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { new: "新收到", contacted: "已聯絡", scheduled: "已排期", completed: "已完成", cancelled: "已取消" };
const PAY: Record<string, string> = { paid: "已付款", pending: "待付款", failed: "付款失敗", refunded: "已退款" };

// 接送服務專案詳細：資料、收入（已付訂金自動計入）、支出明細
export default async function DepositProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: d } = await createAdminClient()
    .from("deposit_bookings")
    .select("id, created_at, owner_name, contact, pet_name, pet_type, service_date, service_time, pickup_address, status, payment_ref, payment_status, payment_amount, shopify_order_name, paid_at, notes")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const orderRef = `deposit:${d.id}`;
  const { entries, urls, error } = await loadEntries(orderRef);
  const projectNo = canonicalProjectNo(projectNoFromNotes(d.notes));
  const paid = d.payment_status === "paid" && d.status !== "cancelled";

  return (
    <ProjectLedger
      projectNo={projectNo === "—" ? "" : projectNo}
      title={d.owner_name || "接送服務"}
      badge="接送服務"
      fields={[
        { label: "專案編號", value: projectNo },
        { label: "付款參考／發票", value: [d.payment_ref, d.shopify_order_name].filter(Boolean).join("　") },
        { label: "主人", value: d.owner_name },
        { label: "聯絡電話", value: d.contact },
        { label: "毛孩", value: d.pet_name ? (d.pet_type ? `${d.pet_name}（${d.pet_type}）` : d.pet_name) : d.pet_type },
        { label: "接送日期・時段", value: [d.service_date, d.service_time].filter(Boolean).join(" ") },
        { label: "接送地址", value: d.pickup_address },
        { label: "狀態", value: STATUS[d.status] || d.status },
        { label: "付款", value: PAY[d.payment_status || "pending"] || d.payment_status },
      ]}
      orderRef={orderRef}
      autoIncome={paid ? { amount: Number(d.payment_amount || 0), date: (d.paid_at || d.created_at).slice(0, 10), label: "接送訂金" } : null}
      entries={entries}
      urls={urls}
      entriesError={error}
    />
  );
}
