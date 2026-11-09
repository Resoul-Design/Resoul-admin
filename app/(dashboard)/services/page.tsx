import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { syncOrderAttributes } from "@/lib/shopify-order-attrs";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { invoiceLabel } from "@/lib/invoice-label";
import { invoiceQuery, matchesInvoice } from "@/lib/invoice-search";
import { CancelButton, MarkRefundedButton } from "./_cancel";
import type { CancelKind } from "./_cancel-actions";

const services = [
  { label: "接送服務", description: "管理接送預約、付款跟進、日曆及 WhatsApp 聯絡。", href: "/deposits", icon: "🚐", key: "deposits" },
  { label: "火化預約", description: "處理火化排期、服務進度及客戶安排。", href: "/bookings", icon: "🕊️", key: "bookings" },
  { label: "獸醫評估", description: "查看及跟進獸醫評估記錄。", href: "/vet-assessments", icon: "🩺", key: "vet_assessments" },
  { label: "紀念品訂單", description: "管理紀念品訂單、付款及出貨狀態。", href: "/orders", icon: "🎁", key: "orders" },
] as const;

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ test?: string; q?: string; status?: string }> }) {
  // 測試記錄預設隱藏；?test=1 只顯示測試記錄（與接送服務等列表相同）
  const params = await searchParams;
  const showTest = params.test === "1";
  const q = String(params.q || "").trim().slice(0, 60);
  const statusFilter = ["active", "cancelled", "refund"].includes(String(params.status)) ? String(params.status) : "";
  // 搜尋或篩選時讀取較多記錄，令舊單都搵到
  const LIMIT = q || statusFilter ? 2000 : 100;
  // 頁面顯示後在背景為新開的 Shopify 訂單補上單號等資料欄位（舊單不改；不影響載入速度）
  after(() => syncOrderAttributes({ first: 30 }).then((r) => { if (r.errors.length) console.error("[order_attrs]", r.errors.join(" | ")); }).catch((e) => console.error("[order_attrs]", e instanceof Error ? e.message : "unknown")));
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const available = services.filter((service) => hasModule(staff, [service.key]));
  if (!available.length) redirect("/");
  const admin = createAdminClient();
  const typeLabel: Record<string, string> = { deposit: "接送服務", cremation: "火化預約", vet: "獸醫評估", product: "紀念品訂單", other: "其他" };
  const typeHref: Record<string, string> = { deposit: "/deposits", cremation: "/bookings", vet: "/vet-assessments", product: "/orders", other: "/new-order" };
  const labelHref: Record<string, string> = Object.fromEntries(Object.entries(typeLabel).map(([key, label]) => [label, typeHref[key]]));
  const serviceQueryHref = (label: string, invoice: unknown) => `${labelHref[label] || "/new-order"}?q=${encodeURIComponent(String(invoice))}`;
  const serviceOrder: Record<string, number> = { deposit: 1, cremation: 2, vet: 3, product: 4, other: 5 };
  const statusLabel: Record<string, string> = { draft: "草稿", awaiting_payment: "待付款", pending: "處理中", paid: "已付款", completed: "已完成", cancelled: "已取消", cancelled_refunded: "已取消（已退款）", refunded: "已退款", partially_refunded: "部分退款", failed: "失敗" };
  // 狀態統一：取消優先（連同退款），其次付款狀態
  const bookingStatus = (r: { status?: string | null; payment_status?: string | null }) =>
    r.status === "cancelled" ? (r.payment_status === "refunded" ? "cancelled_refunded" : "cancelled") : r.payment_status || "";
  // 每筆服務記錄列一行（同一專案共用單號，故同一單號可有多行）。
  // 開新單記錄若已連結接送／火化記錄，只列服務記錄，避免重複；紀念品訂單已同步的 Shopify 訂單亦不重複列出開單記錄。
  const [company, deposits, cremations, products, linkedOrders, draftMarks, cancellations, customerPets] = await Promise.all([
    admin.from("company_orders").select("id, invoice_no, order_type, customer_name, phone, pet_name, amount, status, created_at, linked_id, shopify_order_id, shopify_draft_id, details").is("linked_id", null).order("created_at", { ascending: false }).limit(LIMIT),
    admin.from("deposit_bookings").select("id, invoice_no, owner_name, contact, pet_name, payment_amount, payment_status, shopify_order_name, created_at, is_test, shopify_order_id, payment_draft_id, status").order("created_at", { ascending: false }).limit(LIMIT),
    admin.from("cremation_bookings").select("id, invoice_no, owner_name, contact, pet_name, payment_amount, payment_status, shopify_order_name, source, created_at, is_test, deposit_credit, notes, shopify_order_id, status").order("created_at", { ascending: false }).limit(LIMIT),
    admin.from("product_orders").select("shopify_order_id, invoice_no, customer_name, phone, total_amount, financial_status, cancelled_at, shopify_created_at, is_test, line_items").order("shopify_created_at", { ascending: false }).limit(LIMIT),
    // 開新單的項目（判斷火化／安樂在家有否加購紀念品）
    admin.from("company_orders").select("linked_id, details").not("linked_id", "is", null).order("created_at", { ascending: false }).limit(300),
    // 火化／安樂在家的付款連結（Shopify 草稿）記在跟進記錄
    admin.from("follow_up_marks").select("ref, payment_draft_id").in("entity", ["cremation", "vet"]).not("payment_draft_id", "is", null).limit(500),
    // 取消及退款記錄（migration 未執行時為空）
    admin.from("order_cancellations").select("entity, entity_id, refund_status, amount").limit(2000),
    // 紀念品訂單沒有寵物欄：按單號由客戶資料補上
    admin.from("logistics_orders").select("invoice_no, pet_name").not("pet_name", "is", null).limit(3000),
  ]);
  const cancelMap = new Map((cancellations.data || []).map((c) => [`${c.entity}:${c.entity_id}`, c]));
  const petByInvoice = new Map<string, string>();
  for (const r of [...(customerPets.data || []), ...(cremations.data || []), ...(deposits.data || []), ...(company.data || [])]) if (r.invoice_no != null && r.pet_name) petByInvoice.set(String(r.invoice_no), String(r.pet_name));
  const orderPet = (r: { invoice_no: number | null; line_items?: unknown }) => {
    const attrs = ((Array.isArray(r.line_items) ? r.line_items : []) as { attributes?: { key?: string; value?: string }[] }[]).flatMap((l) => l.attributes || []);
    return attrs.find((a) => /^(pet|pet name|寵物)/i.test(String(a.key || "")))?.value || petByInvoice.get(String(r.invoice_no)) || null;
  };
  const canCancel: Record<CancelKind, boolean> = { deposit: hasModule(staff, ["deposits"]), cremation: hasModule(staff, ["bookings", "vet_assessments"]), product: hasModule(staff, ["orders"]), company: hasModule(staff, ["orders"]) };
  const bookingDraft = new Map((draftMarks.data || []).map((m) => [String(m.ref), String(m.payment_draft_id)]));
  const withAddons = new Set(
    (linkedOrders.data || [])
      .filter((o) => ((o.details as { lines?: { label: string }[] } | null)?.lines || []).slice(1).some((l) => !String(l.label).startsWith("附加費")))
      .map((o) => String(o.linked_id))
  );
  type InvoiceRow = { id: string; kind: CancelKind; rawId: string; invoice_no: number | null; order_type: string; customer_name: string | null; phone: string | null; pet: string | null; amount: number; status: string; created_at: string; ref: string; test: boolean; extra?: string; shopify?: string };
  // Shopify 後台訂單頁（可用 Order Printer 列印 Shopify 發票）；未付款則開付款連結草稿
  const shopDomain = (process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // 未付款的付款連結草稿：先向 Shopify 確認仍然存在（已刪除的草稿不顯示連結）；讀取失敗時照常顯示
  const draftIds = [...new Set([
    ...(deposits.data || []).filter((r) => !r.shopify_order_id && r.payment_draft_id).map((r) => String(r.payment_draft_id)),
    ...(cremations.data || []).filter((r) => !r.shopify_order_id && bookingDraft.has(String(r.id))).map((r) => bookingDraft.get(String(r.id)) as string),
    ...(company.data || []).filter((r) => !r.shopify_order_id && r.shopify_draft_id).map((r) => String(r.shopify_draft_id)),
  ].filter((id) => id.startsWith("gid://shopify/DraftOrder/")))];
  let aliveDrafts: Set<string> | null = new Set();
  try {
    for (let i = 0; i < draftIds.length; i += 100) {
      const res = await shopifyGraphQL<{ nodes: ({ id: string } | null)[] }>(`query($ids: [ID!]!) { nodes(ids: $ids) { ... on DraftOrder { id } } }`, { ids: draftIds.slice(i, i + 100) });
      for (const n of res.nodes) if (n?.id) aliveDrafts.add(n.id);
    }
  } catch {
    aliveDrafts = null;
  }
  const shopifyHref = (orderId?: string | null, draftId?: string | null) => {
    const order = String(orderId || "").split("/").pop();
    const draft = String(draftId || "").split("/").pop();
    if (!shopDomain) return "";
    if (order && /^\d+$/.test(order)) return `https://${shopDomain}/admin/orders/${order}`;
    if (!draft || !/^\d+$/.test(draft) || (aliveDrafts && !aliveDrafts.has(String(draftId)))) return "";
    return `https://${shopDomain}/admin/draft_orders/${draft}`;
  };
  const productOrderIds = new Set((products.data || []).map((r) => r.shopify_order_id));
  const productStatus = (r: { financial_status: string | null; cancelled_at: string | null }) =>
    r.cancelled_at ? (r.financial_status === "REFUNDED" ? "cancelled_refunded" : "cancelled") : r.financial_status === "REFUNDED" ? "refunded" : r.financial_status === "PARTIALLY_REFUNDED" ? "partially_refunded" : r.financial_status === "PAID" ? "paid" : "awaiting_payment";
  const sourceRows: InvoiceRow[] = [
    ...(company.data || []).filter((r) => !(r.shopify_order_id && productOrderIds.has(r.shopify_order_id))).map((r) => {
      const credit = Number((r.details as { depositCredit?: { amount?: number } | null } | null)?.depositCredit?.amount || 0);
      return { id: `company-${r.id}`, kind: "company" as const, rawId: String(r.id), pet: r.pet_name, invoice_no: r.invoice_no, order_type: r.order_type, customer_name: r.customer_name, phone: r.phone, amount: Number(r.amount || 0) - credit, status: r.status, created_at: r.created_at, ref: r.status === "paid" ? `company:${r.id}` : "", test: false, shopify: shopifyHref(r.shopify_order_id, r.shopify_draft_id) };
    }),
    ...(deposits.data || []).map((r) => ({ id: `deposit-${r.id}`, kind: "deposit" as const, rawId: String(r.id), pet: r.pet_name, invoice_no: r.invoice_no, order_type: "deposit", customer_name: r.owner_name, phone: r.contact, amount: Number(r.payment_amount || 0), status: bookingStatus(r), created_at: r.created_at, ref: r.payment_status === "paid" && r.shopify_order_name ? `deposit:${r.id}` : "", test: !!r.is_test, shopify: shopifyHref(r.shopify_order_id, r.payment_draft_id) })),
    ...(cremations.data || []).map((r) => ({ id: `cremation-${r.id}`, kind: "cremation" as const, rawId: String(r.id), pet: r.pet_name, invoice_no: r.invoice_no, order_type: String(r.source || "").includes("euthanasia") ? "vet" : "cremation", extra: withAddons.has(String(r.id)) || /加購[:：]/.test(String(r.notes || "")) ? "＋紀念品" : "", customer_name: r.owner_name, phone: r.contact, amount: Number(r.payment_amount || 0) - Number(r.deposit_credit || 0), status: bookingStatus(r), created_at: r.created_at, ref: r.payment_status === "paid" && r.shopify_order_name ? `booking:${r.id}` : "", test: !!r.is_test, shopify: shopifyHref(r.shopify_order_id, bookingDraft.get(String(r.id))) })),
    ...(products.data || []).map((r) => ({ id: `product-${r.shopify_order_id}`, kind: "product" as const, rawId: String(r.shopify_order_id), pet: orderPet(r), invoice_no: r.invoice_no, order_type: "product", customer_name: r.customer_name, phone: r.phone, amount: Number(r.total_amount || 0), status: productStatus(r), created_at: r.shopify_created_at, ref: ["paid", "partially_refunded"].includes(productStatus(r)) ? `order:${String(r.shopify_order_id).split("/").pop()}` : "", test: !!r.is_test, shopify: shopifyHref(r.shopify_order_id) })),
  ].filter((r) => r.invoice_no != null);
  const testCount = sourceRows.filter((r) => r.test).length;
  const cancelInfo = (r: InvoiceRow) => cancelMap.get(`${r.kind}:${r.rawId}`);
  const isCancelled = (r: InvoiceRow) => r.status === "cancelled" || r.status === "cancelled_refunded";
  const pendingRefund = (r: InvoiceRow) => cancelInfo(r)?.refund_status === "pending";
  const invoiceOnly = invoiceQuery(q);
  const kw = q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  const visibleRows = sourceRows.filter((r) => {
    if (r.test !== showTest) return false;
    if (statusFilter === "active" && isCancelled(r)) return false;
    if (statusFilter === "cancelled" && !isCancelled(r)) return false;
    if (statusFilter === "refund" && !pendingRefund(r)) return false;
    if (!q) return true;
    if (matchesInvoice(q, r.invoice_no)) return true;
    if (invoiceOnly && digits.length < 4) return false;
    return [r.customer_name, r.pet, typeLabel[r.order_type]].some((v) => String(v || "").toLowerCase().includes(kw)) || (digits.length >= 4 && String(r.phone || "").replace(/\D/g, "").includes(digits));
  });
  // 單號由大至細；同一單號按服務類型、建立時間排列
  const invoiceRows = visibleRows.sort((a, b) =>
    Number(b.invoice_no) - Number(a.invoice_no) || (serviceOrder[a.order_type] || 99) - (serviceOrder[b.order_type] || 99) || String(b.created_at || "").localeCompare(String(a.created_at || ""))
  ).slice(0, q || statusFilter ? 500 : 200);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-[var(--soft)]">服務管理</p><h1 className="mt-1 text-3xl font-semibold">服務工作台</h1></div>
        <nav aria-label="服務模組" className="flex flex-wrap gap-2">{available.map((m) => <Link key={m.href} href={m.href} title={m.description} className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm hover:bg-[var(--cream)]">{m.icon} {m.label}</Link>)}</nav>
      </div>
      <section className="mt-8">
        <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
          {showTest && <input type="hidden" name="test" value="1" />}
          <input name="q" defaultValue={q} placeholder="搜尋單號（例如 319、319-DEPOSIT）／客戶／寵物／電話" className="min-w-[260px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm" />
          <select name="status" defaultValue={statusFilter} aria-label="狀態篩選" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"><option value="">全部狀態</option><option value="active">進行中（不含已取消）</option><option value="cancelled">已取消</option><option value="refund">待退款</option></select>
          <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90">搜尋</button>
          {(q || statusFilter) && <Link href={showTest ? "/services?test=1" : "/services"} className="text-sm text-[var(--gold)] hover:underline">清除</Link>}
        </form>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">{q || statusFilter ? "搜尋結果" : showTest ? "測試記錄" : "全部發票"}</h2><span className="flex items-center gap-3 text-sm text-[var(--soft)]">共 {invoiceRows?.length || 0} 張<a href={showTest ? "/api/export/services?test=1" : "/api/export/services"} className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[var(--ink)] hover:bg-[var(--cream)]">匯出 Excel</a></span></div>
        {showTest ? <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm">正在查看測試記錄（不計入正式發票）。<Link href="/services" className="ml-2 text-[var(--gold)] hover:underline">返回正式記錄</Link></div> : testCount > 0 && <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--soft)]">另有 {testCount} 筆測試記錄已隱藏。<Link href="/services?test=1" className="ml-2 text-[var(--gold)] hover:underline">查看測試記錄</Link></div>}<div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">{["發票／單號", "服務類型", "寵物", "客戶", "電話", "金額", "狀態", "建立時間", "功能"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{invoiceRows.map((row) => <tr key={row.id} className={"border-t border-[var(--line)]" + (isCancelled(row) ? " bg-red-50/40" : "")}><td className="px-4 py-3 font-medium text-[var(--gold)]">#{invoiceLabel(row.invoice_no, row.order_type)}</td><td className="px-4 py-3"><Link href={serviceQueryHref(typeLabel[row.order_type] || row.order_type, row.invoice_no)} className="text-[var(--gold)] hover:underline">{typeLabel[row.order_type] || row.order_type}{row.extra || ""} ↗</Link></td><td className="px-4 py-3">{row.pet || "—"}</td><td className="px-4 py-3">{row.customer_name || "—"}</td><td className="px-4 py-3">{row.phone || "—"}</td><td className="px-4 py-3">{row.amount > 0 ? `HK$ ${Number(row.amount).toLocaleString()}` : row.status === "paid" ? "HK$ 0" : <span className="text-[var(--soft)]">待報價</span>}</td><td className="px-4 py-3">{isCancelled(row) ? <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{statusLabel[row.status]}</span> : statusLabel[row.status] || row.status || "—"}{pendingRefund(row) && <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">待退款</span>}{cancelInfo(row)?.refund_status === "refunded" && row.status !== "cancelled_refunded" && <span className="ml-1 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">已退款</span>}</td><td className="px-4 py-3 text-xs text-[var(--soft)]">{String(row.created_at || "").slice(0, 16).replace("T", " ")}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-x-3 gap-y-1"><Link href={`/logistics/${encodeURIComponent(String(row.invoice_no))}`} className="text-[var(--gold)] hover:underline">查看資料</Link>{row.ref && <><a href={`/print/invoices?refs=${encodeURIComponent(row.ref)}`} target="_blank" rel="noopener" className="text-[var(--gold)] hover:underline">發票 PDF</a><a href={`/print/invoices/word?refs=${encodeURIComponent(row.ref)}`} className="text-[var(--gold)] hover:underline">Word</a></>}{row.shopify && <a href={row.shopify} target="_blank" rel="noopener" className="text-[var(--gold)] hover:underline">Shopify ↗</a>}{!isCancelled(row) && canCancel[row.kind] && <CancelButton kind={row.kind} id={row.rawId} label={`單號 ${invoiceLabel(row.invoice_no, row.order_type)}（${typeLabel[row.order_type] || row.order_type}）`} pet={row.pet} />}{pendingRefund(row) && canCancel[row.kind] && <MarkRefundedButton kind={row.kind} id={row.rawId} amount={cancelInfo(row)?.amount == null ? null : Number(cancelInfo(row)?.amount)} />}</div></td></tr>)}</tbody></table>{!invoiceRows.length && <div className="p-8 text-center text-sm text-[var(--soft)]">{q || statusFilter ? "沒有符合的記錄。" : "暫時沒有發票記錄。"}</div>}</div>
      </section>
    </div>
  );
}