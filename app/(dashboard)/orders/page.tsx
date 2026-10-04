import { TestingNotice } from "../_testing-notice";
import { productFollowUps } from "@/lib/follow-up-server";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import { PageHeader } from "../_page-header";
import { createClient } from "@/lib/supabase/server";
import type { ProductOrderRow } from "@/lib/product-orders";
import { shopDomain } from "@/lib/shopify";
import { canonicalProjectNo } from "@/lib/order-label";
import { getStaff, hasModule } from "@/lib/auth";
import { syncProductOrders } from "./actions";
import { OrdersTable, type OrderRow } from "./_table";
import { NewSouvenirOrder } from "./_new-order";
import { loadCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const FIN: Record<string, string> = {
  PAID: "已付款", PENDING: "待付款", PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款", PARTIALLY_REFUNDED: "部分退款", VOIDED: "已作廢",
};
const FUL: Record<string, string> = {
  FULFILLED: "已出貨", UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨", RESTOCKED: "已退貨入庫",
};

// 未付款的紀念品草稿（付款後會變成正式訂單並由同步列出），排在最前
async function loadDraftRows(): Promise<OrderRow[]> {
  const drafts = await loadSouvenirDrafts();
  return drafts.map((d) => {
    const digits = d.phone.replace(/\D/g, "");
    const wa = digits && d.invoiceUrl
      ? `https://wa.me/${digits.startsWith("852") ? digits : `852${digits}`}?text=${encodeURIComponent(`${d.owner}你好，以下是你的 Resoul 紀念品訂單 ${d.name} 付款連結：\n${d.invoiceUrl}\n如有任何疑問，隨時搵我哋。`)}`
      : null;
    return {
      id: d.id,
      orderName: d.name,
      projectNo: d.projectNo || "—",
      date: d.createdAt.slice(0, 10),
      customer: d.owner,
      phone: d.phone,
      items: d.itemsText || "—",
      fin: "PENDING",
      finLabel: "待付款",
      fulLabel: "草稿",
      amount: d.amount,
      currency: d.currency,
      cancelled: false,
      printHref: "",
      whatsapp: wa,
      editUrl: d.adminUrl,
      invoiceUrl: d.invoiceUrl || undefined,
    };
  });
}

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ synced?: string; sync_error?: string; q?: string; followup?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const staff = await getStaff();
  const canCreate = !!staff && hasModule(staff, ["orders"]);
  // 訂單列表與產品目錄同時讀取
  const catalogP = canCreate ? loadCatalog("souvenir") : null;
  const draftsP = loadDraftRows();
  const { data, error } = await supabase
    .from("product_orders").select("*")
    .order("shopify_created_at", { ascending: false }).limit(2000);
  const orders = (data || []) as ProductOrderRow[];

  const { products, error: catalogError } = catalogP ? await catalogP : { products: [], error: "" };

  const orderId = (o: ProductOrderRow) => o.shopify_order_id.split("/").pop() || "";
  const rows: OrderRow[] = orders.map((o) => {
    const phone = (o.phone || "").replace(/\D/g, "");
    // 專案編號只取 RSL- 編號（來自訂單屬性）；Shopify 訂單號 #RS-#### 屬發票編號，不作專案編號。
    const attrProject = (o.line_items || []).flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "";
    const projectNo = canonicalProjectNo(o.order_name, attrProject);
    const wa = phone ? `https://wa.me/${phone.startsWith("852") ? phone : `852${phone}`}?text=${encodeURIComponent(`你好 ${o.customer_name || ""}，關於你的 Resoul 訂單 ${o.order_name}：`)}` : null;
    return {
      id: o.shopify_order_id,
      orderName: o.order_name,
      projectNo,
      date: o.shopify_created_at.slice(0, 10),
      customer: o.customer_name || "",
      phone: o.phone || "",
      items: (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、") || "—",
      fin: o.financial_status || "",
      finLabel: FIN[o.financial_status || ""] || o.financial_status || "—",
      fulLabel: FUL[o.fulfillment_status || ""] || o.fulfillment_status || "—",
      amount: Number(o.total_amount),
      currency: o.currency,
      cancelled: !!o.cancelled_at,
      printHref: `/print/order/${orderId(o)}`,
      whatsapp: wa,
      editUrl: `https://${shopDomain()}/admin/orders/${orderId(o)}`,
    };
  });

  const draftRows = await draftsP;
  // 四類跟進（與接送服務一致）：未付款草稿、已付款未出貨等
  const follow = await productFollowUps(orders);
  const allRows = [...draftRows, ...rows].map((r) => ({ ...r, followUp: follow.result.get(r.id) || null }));
  const staffName = staff?.name?.trim() || staff?.email?.split("@")[0] || "同事";

  return (
    <div>
      <PageHeader title="紀念品訂單">
          {canCreate && <NewSouvenirOrder products={products} catalogError={catalogError} />}
          <form action={syncProductOrders}>
            <button className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--cream)]">
              同步 Shopify 訂單
            </button>
          </form>
      </PageHeader>

      <TestingNotice />

      {params.synced && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">已同步 {params.synced} 張產品訂單到 Supabase。</div>}
      {params.sync_error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">同步失敗：{params.sync_error}</div>}
      {error && <div className="rounded-lg border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">讀取 Supabase 失敗：{error.message}<div className="mt-2 text-[var(--soft)]">請先執行 db/migration_product_orders.sql。</div></div>}
      {!error && allRows.length === 0 && <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無產品訂單。請按「同步 Shopify 訂單」匯入舊記錄。</div>}

      {allRows.length > 0 && <OrdersTable key={(params.q || "") + (params.followup === "1" ? ":f" : "")} rows={allRows} initialQuery={params.q || ""} staffName={staffName} followReady={follow.ready} initialOnlyFollow={params.followup === "1"} />}
    </div>
  );
}
