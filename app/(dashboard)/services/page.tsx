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
  const admin = createAdminClient();
  const typeLabel: Record<string, string> = { deposit: "接送服務", cremation: "火化預約", vet: "獸醫評估", product: "紀念品訂單", other: "其他" };
  const typeHref: Record<string, string> = { deposit: "/deposits", cremation: "/bookings", vet: "/vet-assessments", product: "/orders", other: "/new-order" };
  const labelHref: Record<string, string> = Object.fromEntries(Object.entries(typeLabel).map(([key, label]) => [label, typeHref[key]]));
  const serviceQueryHref = (label: string, invoice: unknown) => `${labelHref[label] || "/new-order"}?q=${encodeURIComponent(String(invoice))}`;
  const statusLabel: Record<string, string> = { draft: "草稿", awaiting_payment: "待付款", pending: "處理中", paid: "已付款", completed: "已完成", cancelled: "已取消", failed: "失敗" };
  const statusSummary = (statuses: string[] = []) => { const set = new Set(statuses); if (set.has("pending")) return "處理中"; if (set.has("awaiting_payment") && set.has("paid")) return "部分待付款"; if (set.has("awaiting_payment")) return "待付款"; if (set.has("paid")) return "已付款"; return statuses.map((value) => statusLabel[value] || value).join("、") || "—"; };
  const [company, deposits, cremations, products] = await Promise.all([
    admin.from("company_orders").select("id, invoice_no, order_type, customer_name, phone, amount, status, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("deposit_bookings").select("id, invoice_no, owner_name, contact, payment_amount, payment_status, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("cremation_bookings").select("id, invoice_no, owner_name, contact, payment_amount, payment_status, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("product_orders").select("id, invoice_no, customer_name, phone, amount, status, shopify_created_at").order("shopify_created_at", { ascending: false }).limit(100),
  ]);
  const sourceRows = [
    ...(company.data || []),
    ...(deposits.data || []).map((r) => ({ id: `deposit-${r.id}`, invoice_no: r.invoice_no, order_type: "deposit", customer_name: r.owner_name, phone: r.contact, amount: r.payment_amount, status: r.payment_status, created_at: r.created_at })),
    ...(cremations.data || []).map((r) => ({ id: `cremation-${r.id}`, invoice_no: r.invoice_no, order_type: "cremation", customer_name: r.owner_name, phone: r.contact, amount: r.payment_amount, status: r.payment_status, created_at: r.created_at })),
    ...(products.data || []).map((r) => ({ id: `product-${r.id}`, invoice_no: r.invoice_no, order_type: "product", customer_name: r.customer_name, phone: r.phone, amount: r.amount, status: r.status, created_at: r.shopify_created_at })),
  ].filter((r) => r.invoice_no != null);
  const grouped = new Map<string, (typeof sourceRows)[number] & { service_labels?: string[]; statuses?: string[]; amount?: number }>();
  for (const row of sourceRows) {
    const key = String(row.invoice_no);
    const existing = grouped.get(key);
    if (!existing) grouped.set(key, { ...row, service_labels: [typeLabel[row.order_type] || row.order_type], statuses: row.status ? [row.status] : [], amount: Number(row.amount || 0) });
    else {
      existing.service_labels = [...new Set([...(existing.service_labels || []), typeLabel[row.order_type] || row.order_type])];
      existing.statuses = [...new Set([...(existing.statuses || []), ...(row.status ? [row.status] : [])])];
      existing.amount = Number(existing.amount || 0) + Number(row.amount || 0);
      if (String(row.created_at || "") > String(existing.created_at || "")) existing.created_at = row.created_at;
    }
  }
  const invoiceRows = sourceRows.map((row) => ({ ...row, service_labels: [typeLabel[row.order_type] || row.order_type], statuses: row.status ? [row.status] : [], amount: Number(row.amount || 0) })).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 200);
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><p className="text-sm text-[var(--soft)]">服務管理</p><h1 className="mt-1 text-3xl font-semibold">服務工作台</h1></div>
        <span className="text-sm text-[var(--soft)]">共 {available.length} 個服務模組</span>
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">全部發票</h2><span className="text-sm text-[var(--soft)]">共 {invoiceRows?.length || 0} 張</span></div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["發票／單號", "服務類型", "客戶", "電話", "金額", "狀態", "建立時間", "功能"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{invoiceRows.map((row) => <tr key={row.invoice_no} className="border-t border-[var(--line)]"><td className="px-4 py-3 font-medium text-[var(--gold)]">#{row.invoice_no}</td><td className="px-4 py-3">{row.service_labels?.length ? <div className="space-y-1">{row.service_labels.map((label) => <Link key={label} href={serviceQueryHref(label, row.invoice_no)} className="block text-[var(--gold)] hover:underline">{label} ↗</Link>)}</div> : "—"}</td><td className="px-4 py-3">{row.customer_name || "—"}</td><td className="px-4 py-3">{row.phone || "—"}</td><td className="px-4 py-3">HK$ {Number(row.amount || 0).toLocaleString()}</td><td className="px-4 py-3">{row.statuses?.length ? <div className="space-y-1">{row.statuses.map((s) => <div key={s}>{statusLabel[s] || s}</div>)}</div> : "—"}</td><td className="px-4 py-3 text-xs text-[var(--soft)]">{String(row.created_at || "").slice(0, 16).replace("T", " ")}</td><td className="px-4 py-3"><Link href={`/logistics/${encodeURIComponent(String(row.invoice_no))}`} className="text-[var(--gold)] hover:underline">查看發票資料</Link></td></tr>)}</tbody></table>{!invoiceRows.length && <div className="p-8 text-center text-sm text-[var(--soft)]">暫時沒有發票記錄。</div>}</div>
      </section>
      <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm text-[var(--soft)]">四個服務共用同一個入口；原有頁面、搜尋、編輯、付款及跟進功能全部保留。</div>
    </div>
  );
}