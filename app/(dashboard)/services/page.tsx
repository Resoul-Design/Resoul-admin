import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";

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
      <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm text-[var(--soft)]">四個服務共用同一個入口；原有頁面、搜尋、編輯、付款及跟進功能全部保留。</div>
    </div>
  );
}

