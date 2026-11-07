import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const services = [
  { label: "接送服務", description: "管理接送預約、付款跟進、日曆及 WhatsApp 聯絡。", href: "/deposits", icon: "🚐", key: "deposits" },
  { label: "火化預約", description: "處理火化排期、服務進度及客戶安排。", href: "/bookings", icon: "🕊️", key: "bookings" },
  { label: "獸醫評估", description: "查看及跟進獸醫評估記錄。", href: "/vet-assessments", icon: "🩺", key: "vet_assessments" },
  { label: "紀念品訂單", description: "管理紀念品訂單、付款及出貨狀態。", href: "/orders", icon: "🎁", key: "orders" },
] as const;

export default async function ServicesPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const available = services.filter((service) => hasModule(staff, [service.key]));
  if (!available.length) redirect("/");
  const { data: invoiceRows } = await createAdminClient().from("company_orders").select("id, invoice_no, order_type, customer_name, phone, amount, status, created_at").order("created_at", { ascending: false }).limit(100);
  const typeLabel: Record<string, string> = { deposit: "接送服務", cremation: "火化預約", vet: "獸醫評估", product: "紀念品訂單", other: "其他" };
  const typeHref: Record<string, string> = { deposit: "/deposits", cremation: "/bookings", vet: "/vet-assessments", product: "/orders", other: "/new-order" };
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><p className="text-sm text-[var(--soft)]">服務管理</p><h1 className="mt-1 text-3xl font-semibold">服務工作台</h1></div>
        <span className="text-sm text-[var(--soft)]">共 {available.length} 個服務模組</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {available.map((service) => (
          <Link key={service.href} href={service.href} className="group rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-sm">
            <div className="flex items-start justify-between gap-4"><span className="text-3xl">{service.icon}</span><span className="text-[var(--gold)] transition-transform group-hover:translate-x-1">→</span></div>
            <h2 className="mt-4 text-xl font-semibold">{service.label}</h2><p className="mt-2 text-sm leading-6 text-[var(--soft)]">{service.description}</p><span className="mt-4 inline-block text-sm text-[var(--gold)]">進入功能</span>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">全部發票</h2><span className="text-sm text-[var(--soft)]">共 {invoiceRows?.length || 0} 張</span></div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["發票／單號", "服務類型", "客戶", "電話", "金額", "狀態", "建立時間", "功能"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{(invoiceRows || []).map((row) => <tr key={row.id} className="border-t border-[var(--line)]"><td className="px-4 py-3 font-medium text-[var(--gold)]">#{row.invoice_no}</td><td className="px-4 py-3">{typeLabel[row.order_type] || row.order_type}</td><td className="px-4 py-3">{row.customer_name || "—"}</td><td className="px-4 py-3">{row.phone || "—"}</td><td className="px-4 py-3">HK$ {Number(row.amount || 0).toLocaleString()}</td><td className="px-4 py-3">{row.status || "—"}</td><td className="px-4 py-3 text-xs text-[var(--soft)]">{String(row.created_at || "").slice(0, 16).replace("T", " ")}</td><td className="px-4 py-3"><Link href={`${typeHref[row.order_type] || "/new-order"}?q=${encodeURIComponent(String(row.invoice_no))}`} className="text-[var(--gold)] hover:underline">查看功能</Link></td></tr>)}</tbody></table>{!invoiceRows?.length && <div className="p-8 text-center text-sm text-[var(--soft)]">暫時沒有發票記錄。</div>}</div>
      </section>
      <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm text-[var(--soft)]">四個服務共用同一個入口；原有頁面、搜尋、編輯、付款及跟進功能全部保留。</div>
    </div>
  );
}

