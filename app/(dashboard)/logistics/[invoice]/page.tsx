import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { updateCustomerData } from "../actions";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  const admin = createAdminClient();
  const [logistics, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    admin.from("company_orders").select("*").eq("invoice_no", Number(invoice) || invoice).maybeSingle(),
    admin.from("deposit_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).maybeSingle(),
    admin.from("cremation_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).maybeSingle(),
    admin.from("product_orders").select("*").eq("invoice_no", Number(invoice) || invoice).maybeSingle(),
  ]);
  const data = logistics.data || (company.data ? { ...company.data, owner_name: company.data.customer_name, phone: company.data.phone, email: company.data.email } : null) || (deposits.data ? { ...deposits.data, phone: deposits.data.contact } : null) || (cremations.data ? { ...cremations.data, phone: cremations.data.contact } : null) || (products.data ? { ...products.data, owner_name: products.data.customer_name } : null);
  if (!data) notFound();
  const row = data as Record<string, unknown>;
  const hiddenKeys = new Set(["id", "client_token", "linked_id", "details", "phone_key", "customer_name", "pickup_fee", "overwritten_fields", "raw_row", "is_test"]);
  const labels: Record<string, string> = {
    invoice_no: "發票編號", row_status: "訂單狀態", pet_name: "寵物名稱", animal: "動物類型", breed: "品種",
    owner_name: "主人姓名", phone: "聯絡電話", arrival_date: "到達日期", arrival_time: "到達時間", pickup_type: "接送方式",
    pickup_from: "接送地點", driver: "司機", pickup_fee: "接送費", pickup_surcharge: "接送附加費", driver_fee_settled_at: "司機費用結算日",
    package_name: "套餐", date_code: "日期代碼", ceremony_or_order_date: "火化／訂單日期", ceremony_time: "火化時間", shower_date: "告別日期",
    invoice_amount: "發票金額", deposit_received: "已收訂金", other_surcharge: "其他附加費", package_price: "套餐價格",
    memorial_addon_price: "紀念品加購", back_to_nature_price: "回歸自然費", urn_storage_rental_price: "骨灰盅存放費", discount_code: "優惠碼",
    discount_price: "折扣金額", balance_settled: "餘額結清",
    weight_kg: "重量（公斤）", email: "電郵", drive_folder_url: "雲端資料夾", urn: "骨灰盅安排", urn_pickup_status: "骨灰盅取回狀態",
    memorial_remarks: "紀念品備註", memorial_supplier: "紀念品供應商", product_pickup_or_delivery_on: "紀念品取貨／送貨日期", memorial_cost: "紀念品成本", urn_cost: "骨灰龕成本",
    delivery_cost_to_customer: "客戶送貨費", driver_or_gogovan_cost: "司機／GoGoVan 費用", commission: "佣金", endup_profit: "最終利潤",
    project_no: "專案編號", order_type: "服務類型", amount: "訂單金額", payment_ref: "付款參考編號", linked_table: "資料來源",
    shopify_draft_id: "Shopify 草稿編號", shopify_invoice_url: "Shopify 付款頁面", created_by: "建立人",
    contact: "聯絡電話", service_date: "服務日期", service_time: "服務時段", notes: "備註",
    payment_amount: "付款金額", payment_currency: "付款貨幣", reminder_count: "付款提醒次數",
    source: "資料來源", last_synced_at: "最後同步時間", overwritten_fields: "被覆蓋欄位", raw_row: "原始資料", is_test: "測試記錄", created_at: "建立時間", updated_at: "更新時間",
  };
  const groups = [
    ["基本資料", ["invoice_no", "project_no", "order_type", "row_status", "date_code"]],
    ["訂單狀態", ["status", "row_status", "logistics_status"]],
    ["付款狀態", ["payment_status", "payment_intent", "deposit_status", "balance_status", "balance_settled"]],
    ["服務進度", ["service_status", "progress", "picked_up_at", "cremation_started_at", "ready_at", "returned_at", "returned_to"]],
    ["主人與寵物", ["owner_name", "phone", "pet_name", "animal", "breed"]],
    ["接送安排", ["pickup_type", "pickup_from", "arrival_date", "arrival_time", "driver", "pickup_surcharge", "driver_fee_settled_at"]],
    ["服務安排", ["service_date", "service_time", "contact", "notes"]],
    ["火化與紀念服務", ["package_name", "ceremony_or_order_date", "ceremony_time", "shower_date", "memorial_addon_price", "memorial_cost", "urn", "urn_cost", "back_to_nature_price", "urn_storage_rental_price"]],
    ["費用與付款", ["invoice_amount", "amount", "payment_amount", "payment_currency", "package_price", "deposit_received", "other_surcharge", "discount_code", "discount_price", "balance_settled", "payment_ref"]],
    ["跟進記錄", ["reminder_count"]],
    ["Shopify 資料", ["shopify_draft_id", "shopify_invoice_url"]],
    ["資料來源", ["linked_table", "source", "created_by", "created_at", "updated_at", "last_synced_at"]],
  ] as const;
  const used = new Set<string>([...groups.flatMap(([, keys]) => keys), ...hiddenKeys]);
  const valueText = (key: string, value: unknown) => {
    if (["status", "row_status", "logistics_status", "payment_status", "deposit_status", "balance_status", "service_status", "progress"].includes(key)) return ({ awaiting_payment: "待付款", pending: "處理中", paid: "已付款", completed: "已完成", cancelled: "已取消", new: "新收到", scheduled: "已排期", pickup: "已接送", cremating: "火化中", ready: "可取回" } as Record<string, string>)[String(value)] || String(value);
    if (key === "order_type") return ({ deposit: "預約接送訂金", cremation: "善終／告別套餐", vet: "安樂在家／獸醫評估", product: "紀念品／加購", other: "其他／自訂" } as Record<string, string>)[String(value)] || String(value);
    if (key === "source" || key === "linked_table") return ({ basic_info_logistic: "物流客戶資料", excel: "Excel 同步", manual: "手動輸入", company_orders: "系統發票", deposit_bookings: "預約接送訂金", cremation_bookings: "善終／告別套餐", product_orders: "紀念品訂單" } as Record<string, string>)[String(value)] || String(value);
    if (key === "urn_pickup_status") return ({ Completed: "已完成", Pending: "待處理", Cancelled: "已取消" } as Record<string, string>)[String(value)] || String(value);
    if (["created_at", "updated_at", "last_synced_at"].includes(key)) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    if (key === "shopify_draft_id") return String(value).split("/").pop() || String(value);
    if (key === "payment_currency") return ({ HKD: "港幣", USD: "美元", CNY: "人民幣" } as Record<string, string>)[String(value)] || String(value);
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };
  const render = (key: string, value: unknown) => <div key={key} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">{labels[key] || key}</div><div className="mt-1 break-words whitespace-pre-wrap text-sm">{key === "shopify_invoice_url" ? <a href={String(value)} target="_blank" rel="noreferrer" className="text-[var(--gold)] hover:underline">開啟 Shopify 付款頁面 ↗</a> : key === "drive_folder_url" ? <a href={String(value)} target="_blank" rel="noreferrer" className="text-[var(--gold)] hover:underline">開啟雲端資料夾 ↗</a> : valueText(key, value)}</div></div>;
  return <div><div className="mb-5 flex flex-wrap items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link><h1 className="text-2xl font-semibold">{invoice}</h1><Link href={`/logistics/${encodeURIComponent(invoice)}/edit`} className="ml-auto rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">編輯完整資料</Link></div><form action={updateCustomerData.bind(null, invoice)} className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-4"><h2 className="mb-3 text-lg font-semibold">編輯客戶資料</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">主人姓名<input name="owner_name" defaultValue={String(row.owner_name || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">電話<input name="phone" defaultValue={String(row.phone || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">寵物名稱<input name="pet_name" defaultValue={String(row.pet_name || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">到達日期<input name="arrival_date" defaultValue={String(row.arrival_date || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">套餐<input name="plan" defaultValue={String(row.plan || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label><label className="text-sm">紀念品備註<input name="memorial_remarks" defaultValue={String(row.memorial_remarks || "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label></div><button className="mt-4 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white">儲存修改</button></form><div className="space-y-6">{groups.map(([title, keys]) => { const entries = keys.map((key) => [key, row[key]] as const).filter(([, value]) => value !== null && value !== undefined && value !== ""); return entries.length ? <section key={title}><h2 className="mb-3 text-lg font-semibold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.map(([key, value]) => render(key, value))}</div></section> : null; })}{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").length > 0 && <section><h2 className="mb-3 text-lg font-semibold">其他資料</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").map(([key, value]) => render(key, value))}</div></section>}</div></div>;
}