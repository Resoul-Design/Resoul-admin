import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { updateCustomerData } from "../actions";
import { RecordEditor } from "../_record-editor";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  const admin = createAdminClient();
  const [logistics, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    // 同一單號可有多筆記錄（同一專案共用單號）
    admin.from("company_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("deposit_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("cremation_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("product_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("shopify_created_at").limit(20),
  ]);
  const co = company.data?.[0], dep = deposits.data?.[0], cre = cremations.data?.[0], pro = products.data?.[0];
  const data = logistics.data || (co ? { ...co, owner_name: co.customer_name, phone: co.phone, email: co.email } : null) || (dep ? { ...dep, phone: dep.contact } : null) || (cre ? { ...cre, phone: cre.contact } : null) || (pro ? { ...pro, owner_name: pro.customer_name } : null);
  if (!data) notFound();
  const row = data as Record<string, unknown>;
  const hiddenKeys = new Set(["id", "client_token", "linked_id", "details", "phone_key", "customer_name", "overwritten_fields", "raw_row", "is_test"]);
  const labels: Record<string, string> = {
    invoice_no: "發票編號", row_status: "訂單狀態", pet_name: "寵物名稱", animal: "動物類型", breed: "品種",
    owner_name: "主人姓名", phone: "聯絡電話", arrival_date: "到達日期", arrival_time: "到達時間", pickup_type: "接送方式",
    pickup_from: "接送地點", driver: "司機", pickup_fee: "接送費", pickup_surcharge: "接送附加費", driver_fee_settled_at: "司機費用結算日",
    package_name: "套餐", date_code: "日期代碼", ceremony_or_order_date: "火化／訂單日期", ceremony_time: "火化時間", shower_date: "告別日期",
    invoice_amount: "發票金額", deposit_received: "已收訂金", other_surcharge: "其他附加費", package_price: "套餐價格",
    memorial_addon_price: "紀念品加購", back_to_nature_price: "回歸自然費", urn_storage_rental_price: "骨灰盅存放費", discount_code: "優惠碼",
    discount_price: "折扣金額", balance_settled: "餘額結清",
    weight_kg: "重量（公斤）", email: "電郵", drive_folder_url: "雲端資料夾", urn: "骨灰盅安排", urn_pickup_status: "骨灰盅取回狀態",
    memorial_remarks: "紀念品備註", memorial_supplier: "紀念品供應商", product_pickup_or_delivery_on: "紀念品取貨／送貨日期", memorial_cost: "紀念品成本",
    delivery_cost_to_customer: "客戶送貨費", driver_or_gogovan_cost: "司機／GoGoVan 費用", commission: "佣金", endup_profit: "最終利潤",
    project_no: "專案編號", order_type: "服務類型", amount: "訂單金額", payment_ref: "付款參考編號", linked_table: "資料來源",
    case_no: "專案編號", contact: "聯絡電話", plan: "方案", pet_type: "寵物種類", service_date: "服務日期", service_time: "時段", pickup_address: "地址",
    notes: "備註", status: "狀態", payment_status: "付款狀態", payment_amount: "付款金額", payment_currency: "貨幣", paid_at: "付款時間",
    shopify_order_id: "Shopify 訂單 ID（內部參考）", shopify_order_name: "Shopify 訂單號（內部參考）", payment_link: "付款連結", payment_link_at: "付款連結建立時間",
    payment_draft_id: "Shopify 草稿 ID（內部參考）", reminder_count: "提醒次數", reminded_at: "最後提醒時間", follow_up_closed_at: "跟進完成時間", handled_by: "負責同事",
    credit_target: "訂金已用於", credit_amount: "訂金抵扣金額", credit_applied_at: "訂金抵扣時間", deposit_credit: "已扣接送訂金", deposit_credit_ref: "所扣訂金記錄",
    cost: "成本", picked_up_at: "接收時間", cremation_started_at: "火化開始時間", ready_at: "可取回時間", returned_at: "交還時間", returned_to: "交還對象",
    customer_name: "客人姓名", payment_intent: "付款方式", referrer_phone: "推薦人電話", shopify_draft_id: "Shopify 草稿 ID（內部參考）", shopify_invoice_url: "付款連結",
    sync_error: "Shopify 同步錯誤", created_by: "開單同事", order_name: "Shopify 訂單號（內部參考）", shopify_created_at: "Shopify 建立時間", shopify_updated_at: "Shopify 更新時間",
    financial_status: "付款狀態（Shopify）", fulfillment_status: "出貨狀態", total_amount: "訂單金額", currency: "貨幣", line_items: "商品", cancelled_at: "取消時間", synced_at: "同步時間",
    package_code: "套餐代碼", urn_storage_expires_on: "骨灰盅存放到期日", referral: "推薦來源", referral_fee: "推薦費", customer_order_date: "客人下單日期",
    delivered_to_supplier_on: "交供應商日期", supplier_returned_on: "供應商交回日期", source_row: "來源列", source_hash: "來源校驗碼", source_updated_at: "來源更新時間",
    source: "資料來源", last_synced_at: "最後同步時間", overwritten_fields: "被覆蓋欄位", raw_row: "原始資料", is_test: "測試記錄", created_at: "建立時間", updated_at: "更新時間",
  };
  const groups = [
    ["基本資料", ["invoice_no", "project_no", "order_type", "row_status", "date_code"]],
    ["訂單狀態", ["status", "row_status", "logistics_status"]],
    ["付款狀態", ["payment_status", "payment_intent", "deposit_status", "balance_status", "balance_settled"]],
    ["服務進度", ["service_status", "progress", "picked_up_at", "cremation_started_at", "ready_at", "returned_at", "returned_to"]],
    ["主人與寵物", ["owner_name", "phone", "pet_name", "animal", "breed"]],
    ["接送安排", ["pickup_type", "pickup_from", "arrival_date", "arrival_time", "driver", "pickup_fee", "pickup_surcharge", "driver_fee_settled_at"]],
    ["火化與紀念服務", ["package_name", "ceremony_or_order_date", "ceremony_time", "shower_date", "memorial_addon_price", "back_to_nature_price", "urn_storage_rental_price"]],
    ["費用與付款", ["invoice_amount", "amount", "package_price", "deposit_received", "other_surcharge", "discount_code", "discount_price", "balance_settled", "payment_ref"]],
    ["資料來源", ["linked_table", "source", "created_at", "updated_at", "last_synced_at"]],
  ] as const;
  const used = new Set<string>([...groups.flatMap(([, keys]) => keys), ...hiddenKeys]);
  const valueText = (key: string, value: unknown) => {
    if (["status", "row_status", "logistics_status", "payment_status", "deposit_status", "balance_status", "service_status", "progress"].includes(key)) return ({ awaiting_payment: "待付款", pending: "處理中", paid: "已付款", completed: "已完成", cancelled: "已取消", new: "新收到", scheduled: "已排期", pickup: "已接送", cremating: "火化中", ready: "可取回" } as Record<string, string>)[String(value)] || String(value);
    if (key === "order_type") return ({ deposit: "預約接送訂金", cremation: "善終／告別套餐", vet: "安樂在家／獸醫評估", product: "紀念品／加購", other: "其他／自訂" } as Record<string, string>)[String(value)] || String(value);
    if (key === "source" || key === "linked_table") return ({ basic_info_logistic: "物流客戶資料", excel: "Excel 同步", manual: "手動輸入", company_orders: "系統發票", deposit_bookings: "預約接送訂金", cremation_bookings: "善終／告別套餐", product_orders: "紀念品訂單", "admin:deposit": "後台開單（接送訂金）", "admin:cremation": "後台開單（火化）", "admin:euthanasia": "後台開單（安樂在家）", "web:pickup-deposit": "網站預約接送", "web:cremation": "網站火化預約", "web:euthanasia": "網站獸醫評估" } as Record<string, string>)[String(value)] || String(value);
    if (key === "payment_intent") return ({ link: "付款連結", received: "已收款" } as Record<string, string>)[String(value)] || String(value);
    // 時間：轉為香港時間
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) { const d = new Date(value); if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "); }
    if (key === "urn_pickup_status") return ({ Completed: "已完成", Pending: "待處理", Cancelled: "已取消" } as Record<string, string>)[String(value)] || String(value);
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };
  // 編輯服務記錄（保存後同步 Shopify）：接送訂金、火化／安樂在家、未連結服務記錄的開新單（紀念品、其他）
  const s = (v: unknown) => (v == null ? "" : String(v));
  const dateOf = (v: unknown) => s(v).slice(0, 10);
  const editors = (
    <section className="mb-6 space-y-3">
      <h2 className="text-lg font-semibold">編輯服務資料</h2>
      {(deposits.data || []).map((d) => <RecordEditor key={d.id} kind="deposit" id={d.id} title={`接送訂金（${dateOf(d.created_at)}）`} initial={{ owner_name: s(d.owner_name), contact: s(d.contact), pet_name: s(d.pet_name), pet_type: s(d.pet_type), service_date: s(d.service_date), service_time: s(d.service_time), pickup_address: s(d.pickup_address), notes: s(d.notes) }} />)}
      {(cremations.data || []).map((b) => <RecordEditor key={b.id} kind="cremation" id={b.id} title={`${s(b.source).includes("euthanasia") ? "安樂在家" : "火化預約"}（${dateOf(b.created_at)}）`} initial={{ owner_name: s(b.owner_name), contact: s(b.contact), pet_name: s(b.pet_name), pet_type: s(b.pet_type), service_date: s(b.service_date), service_time: s(b.service_time), pickup_address: s(b.pickup_address), notes: s(b.notes) }} />)}
      {(company.data || []).filter((o) => !o.linked_id).map((o) => <RecordEditor key={o.id} kind="company" id={o.id} title={`${valueText("order_type", o.order_type)}（${dateOf(o.created_at)}）`} initial={{ owner_name: s(o.customer_name), contact: s(o.phone), email: s(o.email), pet_name: s(o.pet_name) }} />)}
    </section>
  );
  const render = (key: string, value: unknown) => <div key={key} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">{labels[key] || key}</div><div className="mt-1 break-words whitespace-pre-wrap text-sm">{valueText(key, value)}</div></div>;
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div>{editors}{logistics.data && <form action={updateCustomerData.bind(null, invoice)} className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-4"><h2 className="mb-3 text-lg font-semibold">編輯客戶資料</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">主人姓名<input name="owner_name" defaultValue={String(row.owner_name || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">電話<input name="phone" defaultValue={String(row.phone || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">寵物名稱<input name="pet_name" defaultValue={String(row.pet_name || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">到達日期<input name="arrival_date" defaultValue={String(row.arrival_date || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">套餐<input name="package_name" defaultValue={String(row.package_name || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">紀念品備註<input name="memorial_remarks" defaultValue={String(row.memorial_remarks || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label></div><button className="mt-4 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">儲存修改</button></form>}<div className="space-y-6">{groups.map(([title, keys]) => { const entries = keys.map((key) => [key, row[key]] as const).filter(([, value]) => value !== null && value !== undefined && value !== ""); return entries.length ? <section key={title}><h2 className="mb-3 text-lg font-semibold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.map(([key, value]) => render(key, value))}</div></section> : null; })}{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").length > 0 && <section><h2 className="mb-3 text-lg font-semibold">其他資料</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").map(([key, value]) => render(key, value))}</div></section>}</div></div>;
}