import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain, shopifyGraphQL } from "@/lib/shopify";
import { ORDER_STATUS_LABEL, ORDER_TYPE_MAP, type OrderType } from "@/lib/order-types";
import { PageHeader, headerLinkClass } from "../../_page-header";
import { ChangeInvoiceNo, CopyLink, RetrySync, WhatsAppLink } from "./_panels";

export const dynamic = "force-dynamic";

const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const LIST_PATH: Record<OrderType, string> = { cremation: "/bookings", vet: "/vet-assessments", deposit: "/deposits", product: "/orders", other: "/orders" };
const PAY_LABEL: Record<string, string> = { paid: "已付款", pending: "待付款", failed: "付款失敗", refunded: "已退款" };

type Detail = { lines?: { label: string; quantity: number; price?: number }[]; serviceDate?: string | null; serviceSlot?: string | null; address?: string | null; internalNote?: string | null; publicNote?: string | null; receivedMethod?: string | null };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  const { data: o } = await admin.from("company_orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const type = o.order_type as OrderType;
  const def = ORDER_TYPE_MAP[type];
  if (!hasModule(staff, [def.module])) redirect("/");

  // 付款狀態：服務記錄以後台記錄為準；紀念品／自訂單向 Shopify 草稿查詢是否已付款
  let status: string = o.status;
  let payment = "";
  let shopifyOrderName = "";
  if (o.linked_table && o.linked_id) {
    const { data: row } = await admin.from(o.linked_table).select("payment_status, status, shopify_order_name").eq("id", o.linked_id).maybeSingle();
    if (row) {
      payment = PAY_LABEL[row.payment_status || ""] || row.payment_status || "";
      shopifyOrderName = row.shopify_order_name || "";
      if (row.payment_status === "paid" && status !== "paid") status = "paid";
      if (row.status === "cancelled") status = "cancelled";
    }
  } else if (o.shopify_draft_id && status === "awaiting_payment") {
    try {
      const res = await shopifyGraphQL<{ draftOrder: { status: string; order: { id: string; name: string; displayFinancialStatus: string | null } | null } | null }>(
        `query($id: ID!) { draftOrder(id: $id) { status order { id name displayFinancialStatus } } }`,
        { id: o.shopify_draft_id }
      );
      const order = res.draftOrder?.order;
      if (order && order.displayFinancialStatus === "PAID") {
        status = "paid";
        shopifyOrderName = order.name;
        await admin.from("company_orders").update({ status: "paid", shopify_order_id: order.id, updated_at: new Date().toISOString() }).eq("id", id);
      }
    } catch {
      // 讀取失敗時沿用記錄狀態
    }
  }
  if (status !== o.status) await admin.from("company_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);

  const d = (o.details || {}) as Detail;
  const host = shopDomain().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const digits = String(o.phone || "").replace(/\D/g, "");
  const waNumber = digits.length === 8 ? `852${digits}` : digits;
  const waText = `${o.customer_name}你好，我係 Resoul。你的單號是 ${o.invoice_no}${o.pet_name ? `（${o.pet_name}）` : ""}，金額 ${hk(Number(o.amount || 0))}。${o.shopify_invoice_url && status !== "paid" ? `付款連結：${o.shopify_invoice_url}` : ""}`;
  const unsynced = !o.shopify_draft_id || !!o.sync_error;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={<span className="flex flex-wrap items-center gap-3">單號 {o.invoice_no}<span className="rounded-full bg-[var(--cream)] px-3 py-1 text-sm font-normal">{def.icon} {def.label}</span></span>}>
        <Link href={`/new-order?from=${o.id}`} className={headerLinkClass}>複製為新單</Link>
        <Link href="/new-order" className={headerLinkClass}>＋ 開新單</Link>
      </PageHeader>

      {unsynced && status !== "paid" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Shopify 未同步</p>
          {o.sync_error && <p className="mt-1">{o.sync_error}</p>}
          <p className="mt-1">記錄已保存（單號 {o.invoice_no}）。按「重試同步」會沿用同一張單，不會重覆開單。</p>
          <div className="mt-2"><RetrySync id={o.id} /></div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="單號（對外）" value={String(o.invoice_no)} strong />
        <Card label="專案編號" value={o.project_no} href={`/projects/group/${encodeURIComponent(o.project_no)}`} />
        <Card label="付款參考" value={o.payment_ref} mono />
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
          <dt className="text-[var(--soft)]">客人</dt><dd>{o.customer_name} · {o.phone || "—"}{o.email ? ` · ${o.email}` : ""}</dd>
          {o.pet_name && <><dt className="text-[var(--soft)]">寵物</dt><dd>{o.pet_name}</dd></>}
          <dt className="text-[var(--soft)]">內容</dt>
          <dd>{(d.lines || []).map((l, i) => <div key={i}>{l.label}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</div>)}</dd>
          <dt className="text-[var(--soft)]">金額</dt><dd className="font-medium">{hk(Number(o.amount || 0))}</dd>
          <dt className="text-[var(--soft)]">狀態</dt><dd>{ORDER_STATUS_LABEL[status] || status}{payment && payment !== ORDER_STATUS_LABEL[status] ? ` · ${payment}` : ""}{d.receivedMethod ? ` · 開單時已收（${d.receivedMethod}）` : ""}</dd>
          {(d.serviceDate || d.serviceSlot) && <><dt className="text-[var(--soft)]">日期／時段</dt><dd>{[d.serviceDate, d.serviceSlot].filter(Boolean).join(" ")}</dd></>}
          {d.address && <><dt className="text-[var(--soft)]">地址</dt><dd>{d.address}</dd></>}
          {o.referrer_phone && <><dt className="text-[var(--soft)]">推薦人電話</dt><dd>{o.referrer_phone}</dd></>}
          {d.publicNote && <><dt className="text-[var(--soft)]">對外備註</dt><dd>{d.publicNote}</dd></>}
          {d.internalNote && <><dt className="text-[var(--soft)]">內部備註</dt><dd>{d.internalNote}</dd></>}
          <dt className="text-[var(--soft)]">開單</dt><dd>{o.created_by || "—"} · {new Date(o.created_at).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })}</dd>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
          {o.shopify_invoice_url && status !== "paid" && <CopyLink url={o.shopify_invoice_url} />}
          {o.shopify_invoice_url && status !== "paid" && <a href={o.shopify_invoice_url} target="_blank" rel="noopener noreferrer" className={headerLinkClass}>開啟付款頁 ↗</a>}
          {waNumber && <WhatsAppLink href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`} className={headerLinkClass + " text-green-700"} />}
          <Link href={`${LIST_PATH[type]}?q=${encodeURIComponent(o.project_no)}`} className={headerLinkClass}>到「{def.label}」列表</Link>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-sm">
        <summary className="cursor-pointer text-[var(--soft)]">內部參考（Shopify）</summary>
        <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
          <dt className="text-[var(--soft)]">草稿訂單</dt>
          <dd>{o.shopify_draft_id ? <a className="text-[var(--gold)] hover:underline" href={`https://${host}/admin/draft_orders/${o.shopify_draft_id.split("/").pop()}`} target="_blank" rel="noopener noreferrer">開啟 Shopify 草稿 ↗</a> : "—"}</dd>
          <dt className="text-[var(--soft)]">Shopify 訂單</dt>
          <dd>{o.shopify_order_id ? <a className="text-[var(--gold)] hover:underline" href={`https://${host}/admin/orders/${String(o.shopify_order_id).split("/").pop()}`} target="_blank" rel="noopener noreferrer">{shopifyOrderName || "開啟 Shopify 訂單"} ↗</a> : shopifyOrderName || "—"}</dd>
        </dl>
        <p className="mt-2 text-xs text-[var(--soft)]">Shopify 單號只供內部核對；對客人、發票及訂金抵扣一律用單號 {o.invoice_no}。</p>
      </details>

      {staff.role === "admin" && <ChangeInvoiceNo current={o.invoice_no} />}
    </div>
  );
}

function Card({ label, value, href, strong, mono }: { label: string; value: string; href?: string; strong?: boolean; mono?: boolean }) {
  const body = <div className={(strong ? "text-2xl font-semibold" : "text-sm font-medium") + (mono ? " font-mono break-all" : " break-words") + (href ? " text-[var(--gold)]" : "")}>{value}</div>;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="text-xs text-[var(--soft)]">{label}</div>
      <div className="mt-1">{href ? <Link href={href} className="hover:underline">{body}</Link> : body}</div>
    </div>
  );
}
