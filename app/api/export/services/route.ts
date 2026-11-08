import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { buildXlsx, type Cell, type Sheet } from "@/lib/xlsx";
import { invoiceLabel } from "@/lib/invoice-label";
import { extraOrders } from "@/lib/logistics-extra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 全部服務資料匯出 Excel：客戶資料（Excel 欄位）、接送訂金、火化／獸醫、紀念品訂單、開新單，各一張工作表。
// 按員工權限只匯出可查看的部分；預設不含測試記錄（?test=1 包括測試記錄）。
const STATUS: Record<string, string> = {
  new: "新收到", contacted: "已聯絡", scheduled: "已排期", pickup: "已接收", picked_up: "已接收", cremating: "火化中", ready: "可取回", returned: "已交還", completed: "已完成", cancelled: "已取消",
  pending: "待付款", paid: "已付款", failed: "付款失敗", refunded: "已退款", awaiting_payment: "待付款", draft: "草稿",
  PAID: "已付款", PENDING: "待付款", REFUNDED: "已退款", PARTIALLY_REFUNDED: "部分退款", VOIDED: "已作廢", FULFILLED: "已出貨", UNFULFILLED: "未出貨", PARTIALLY_FULFILLED: "部分出貨",
};
const ORDER_TYPE: Record<string, string> = { deposit: "預約接送訂金", cremation: "善終／告別套餐", vet: "安樂在家／獸醫評估", product: "紀念品／加購", other: "其他／自訂" };
const st = (v: unknown) => (v == null || v === "" ? "" : STATUS[String(v)] || String(v));
const hk = (v: unknown) => { if (!v) return ""; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "); };
const n = (v: unknown): Cell => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : String(v));
const s = (v: unknown): Cell => (v == null ? "" : String(v));
const creditUse = (t: unknown) => { const v = String(t || ""); return !v ? "" : v.startsWith("cremation:") ? "火化預約／安樂在家" : v.startsWith("company:") ? "開新單" : v.startsWith("draft:") ? "紀念品付款連結" : v; };

export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const includeTest = new URL(req.url).searchParams.get("test") === "1";
  const can = {
    logistics: hasModule(staff, ["inventory"]),
    deposit: hasModule(staff, ["deposits"]),
    cremation: hasModule(staff, ["bookings"]),
    vet: hasModule(staff, ["vet_assessments"]),
    order: hasModule(staff, ["orders"]),
  };
  if (!Object.values(can).some(Boolean)) return new Response("Forbidden", { status: 403 });
  const admin = createAdminClient();
  const all = async (table: string, order: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      let q = admin.from(table).select("*").order(order, { ascending: false }).range(from, from + 999);
      if (!includeTest && table !== "company_orders") q = q.eq("is_test", false);
      const { data, error } = await q;
      if (error || !data?.length) break;
      rows.push(...(data as Record<string, unknown>[]));
      if (data.length < 1000) break;
    }
    return rows;
  };
  const sheets: Sheet[] = [];

  if (can.logistics) {
    const fields = LOGISTICS_FIELDS.filter((f) => !f.adminOnly || staff.role === "admin");
    const rows = await all("logistics_orders", "invoice_no");
    sheets.push({
      name: "客戶資料（Excel 欄位）",
      headers: ["單號", ...fields.map((f) => f.label), "資料來源", "最後更新"],
      rows: rows.map((r) => [n(r.invoice_no), ...fields.map((f) => (f.type === "number" ? n(r[f.key]) : s(r[f.key]))), r.source === "admin" ? "後台建立" : r.source === "basic_info_logistic" ? "Excel 匯入" : s(r.source), hk(r.updated_at)]),
    });
    // 附加單（Excel 66B 等，附在原單號）
    const extras = rows.flatMap((r) => extraOrders(r).map((x) => ({ parent: r, x })));
    if (extras.length) {
      sheets.push({
        name: "附加單",
        headers: ["附加單號", "原單號", "主人姓名", ...fields.filter((f) => f.key !== "owner_name").map((f) => f.label)],
        rows: extras.map(({ parent, x }) => [x.ref, n(parent.invoice_no), s(x.fields.owner_name ?? parent.owner_name), ...fields.filter((f) => f.key !== "owner_name").map((f) => (f.type === "number" ? n(x.fields[f.key]) : s(x.fields[f.key])))]),
      });
    }
  }
  if (can.deposit) {
    const rows = await all("deposit_bookings", "created_at");
    sheets.push({
      name: "接送訂金",
      headers: ["單號", "專案編號", "建立時間", "主人", "電話", "寵物", "寵物種類", "服務日期", "時段", "接送地址", "狀態", "付款狀態", "金額（HKD）", "付款時間", "訂金已用於", "抵扣金額", "付款參考", "Shopify 訂單號（內部參考）", "來源", "備註"],
      rows: rows.map((r) => [invoiceLabel(r.invoice_no as number | null, "deposit"), s(r.project_no), hk(r.created_at), s(r.owner_name), s(r.contact), s(r.pet_name), s(r.pet_type), s(r.service_date), s(r.service_time), s(r.pickup_address), st(r.status), st(r.payment_status), n(r.payment_amount), hk(r.paid_at), creditUse(r.credit_target), n(r.credit_amount), s(r.payment_ref), s(r.shopify_order_name), s(r.source), s(r.notes)]),
    });
  }
  if (can.cremation || can.vet) {
    const rows = (await all("cremation_bookings", "created_at")).filter((r) => (String(r.source || "").includes("euthanasia") ? can.vet : can.cremation));
    sheets.push({
      name: "火化及獸醫評估",
      headers: ["單號", "類型", "專案編號", "建立時間", "主人", "電話", "寵物", "寵物種類", "方案", "服務日期", "時段", "地址", "狀態", "付款狀態", "收費（HKD）", "已扣接送訂金", "實收（HKD）", "付款時間", "付款參考", "Shopify 訂單號（內部參考）", "來源", "備註"],
      rows: rows.map((r) => {
        const fee = r.payment_amount == null ? null : Number(r.payment_amount);
        const credit = Number(r.deposit_credit || 0);
        const project = canonicalProjectNo(s(r.case_no) as string, projectNoFromNotes(s(r.notes) as string));
        return [n(r.invoice_no), String(r.source || "").includes("euthanasia") ? "獸醫評估" : "火化預約", project === "—" ? "" : project, hk(r.created_at), s(r.owner_name), s(r.contact), s(r.pet_name), s(r.pet_type), s(r.plan), s(r.service_date), s(r.service_time), s(r.pickup_address), st(r.status), st(r.payment_status), fee, credit || null, fee == null ? null : fee - credit, hk(r.paid_at), s(r.payment_ref), s(r.shopify_order_name), s(r.source), s(r.notes)];
      }),
    });
  }
  if (can.order) {
    const rows = await all("product_orders", "shopify_created_at");
    sheets.push({
      name: "紀念品訂單",
      headers: ["單號", "專案編號", "Shopify 訂單號（內部參考）", "日期", "客人", "電話", "電郵", "商品", "金額（HKD）", "付款狀態", "出貨狀態", "取消時間"],
      rows: rows.map((r) => {
        const items = (Array.isArray(r.line_items) ? r.line_items : []) as { title?: string; variant_title?: string | null; quantity?: number; unit_price?: number | null }[];
        return [n(r.invoice_no), s(r.project_no), s(r.order_name), hk(r.shopify_created_at), s(r.customer_name), s(r.phone), s(r.email),
          items.map((it) => `${it.title || ""}${it.variant_title ? `（${it.variant_title}）` : ""} × ${it.quantity ?? 1}${it.unit_price != null ? `　HK$${Number(it.unit_price).toLocaleString("en-US")}` : ""}`).join("\n"),
          n(r.total_amount), st(r.financial_status), st(r.fulfillment_status), hk(r.cancelled_at)];
      }),
    });
    const co = await all("company_orders", "created_at");
    sheets.push({
      name: "開新單記錄",
      headers: ["單號", "類型", "專案編號", "建立時間", "客人", "電話", "電郵", "寵物", "項目", "金額（HKD）", "扣除接送訂金", "應付（HKD）", "狀態", "付款方式", "開單同事"],
      rows: co.map((r) => {
        const d = (r.details || {}) as { lines?: { label: string; quantity?: number }[]; depositCredit?: { amount?: number } | null; receivedMethod?: string | null };
        const credit = Number(d.depositCredit?.amount || 0);
        return [n(r.invoice_no), ORDER_TYPE[String(r.order_type)] || s(r.order_type), s(r.project_no), hk(r.created_at), s(r.customer_name), s(r.phone), s(r.email), s(r.pet_name),
          (d.lines || []).map((l) => `${l.label} × ${l.quantity ?? 1}`).join("\n"), n(r.amount), credit || null, r.amount == null ? null : Number(r.amount) - credit, st(r.status),
          r.payment_intent === "received" ? `已收款${d.receivedMethod ? `（${d.receivedMethod}）` : ""}` : "付款連結", s(r.created_by)];
      }),
    });
  }

  const file = buildXlsx(sheets);
  const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  await logAudit("export_services_xlsx", "export", "services", `匯出全部服務資料 Excel（${sheets.map((x) => `${x.name} ${x.rows.length}`).join("、")}${includeTest ? "，含測試記錄" : ""}）`);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resoul-services-${day}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Resoul 全部服務資料 ${day}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
