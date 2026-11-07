import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  const { data, error } = await createAdminClient().from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle();
  if (error || !data) notFound();
  const row = data as Record<string, unknown>;
  const hiddenKeys = new Set(["overwritten_fields", "raw_row", "is_test"]);
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
    source: "資料來源", last_synced_at: "最後同步時間", overwritten_fields: "被覆蓋欄位", raw_row: "原始資料", is_test: "測試記錄", created_at: "建立時間", updated_at: "更新時間",
  };
  const groups = [
    ["基本資料", ["invoice_no", "row_status", "date_code"]],
    ["主人與寵物", ["owner_name", "phone", "pet_name", "animal", "breed"]],
    ["接送安排", ["pickup_type", "pickup_from", "arrival_date", "arrival_time", "driver", "pickup_fee", "pickup_surcharge", "driver_fee_settled_at"]],
    ["火化與紀念服務", ["package_name", "ceremony_or_order_date", "ceremony_time", "shower_date", "memorial_addon_price", "back_to_nature_price", "urn_storage_rental_price"]],
    ["費用與付款", ["invoice_amount", "package_price", "deposit_received", "other_surcharge", "discount_code", "discount_price", "balance_settled"]],
  ] as const;
  const used = new Set<string>([...groups.flatMap(([, keys]) => keys), ...hiddenKeys]);
  const valueText = (key: string, value: unknown) => {
    if (key === "source") return ({ basic_info_logistic: "基本物流資料", excel: "Excel 同步", manual: "手動輸入" } as Record<string, string>)[String(value)] || String(value);
    if (key === "urn_pickup_status") return ({ Completed: "已完成", Pending: "待處理", Cancelled: "已取消" } as Record<string, string>)[String(value)] || String(value);
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };
  const render = (key: string, value: unknown) => <div key={key} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">{labels[key] || key}</div><div className="mt-1 break-words whitespace-pre-wrap text-sm">{valueText(key, value)}</div></div>;
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 物流客戶</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div><div className="space-y-6">{groups.map(([title, keys]) => { const entries = keys.map((key) => [key, row[key]] as const).filter(([, value]) => value !== null && value !== undefined && value !== ""); return entries.length ? <section key={title}><h2 className="mb-3 text-lg font-semibold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.map(([key, value]) => render(key, value))}</div></section> : null; })}{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").length > 0 && <section><h2 className="mb-3 text-lg font-semibold">其他資料</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(row).filter(([key, value]) => !used.has(key) && value !== null && value !== "").map(([key, value]) => render(key, value))}</div></section>}</div></div>;
}

