// 客戶資料（Excel 欄位）自動填入：按同一單號的單據（接送訂金、火化／獸醫、開新單、紀念品訂單）推算各欄位。
// 只用作表格空白欄位的預設值；按「儲存修改」後才保存。
import { PLAN_CODES } from "@/lib/company";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const first = (...vals: unknown[]) => vals.map(str).find(Boolean) || "";
const hkDate = (iso: unknown) => { const d = new Date(str(iso)); return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10); };
const isPlanLabel = (label: string) => Object.keys(PLAN_CODES).some((k) => label.includes(k));

// 火化進度 → Excel「訂單狀態」
const ROW_STATUS: Record<string, string> = {
  new: "Appointment Made", contacted: "Appointment Made", scheduled: "Appointment Made",
  pickup: "Processing", picked_up: "Processing", cremating: "Processing",
  ready: "To collect Urn", returned: "Completed", completed: "Completed",
};

export function deriveCustomerData(src: { deposits: Row[]; cremations: Row[]; company: Row[]; products: Row[] }): Record<string, string | number> {
  const live = (r: Row) => str(r.status) !== "cancelled" && !r.cancelled_at;
  const deps = src.deposits.filter(live);
  const cres = src.cremations.filter(live);
  const crem = cres.find((r) => !str(r.source).includes("euthanasia"));
  const vet = cres.find((r) => str(r.source).includes("euthanasia"));
  const companies = src.company.filter((c) => str(c.status) !== "cancelled");
  const products = src.products.filter(live);
  const dep = deps[0];
  const any = [dep, crem, vet, ...companies, ...products].filter(Boolean) as Row[];
  if (!any.length) return {};

  const out: Record<string, string | number> = {};
  const set = (k: string, v: string | number) => { if (v !== "" && v != null && !(typeof v === "number" && !Number.isFinite(v))) out[k] = v; };

  // 主人及寵物
  set("owner_name", first(dep?.owner_name, crem?.owner_name, vet?.owner_name, ...companies.map((c) => c.customer_name), ...products.map((p) => p.customer_name)));
  set("phone", first(dep?.contact, crem?.contact, vet?.contact, ...companies.map((c) => c.phone), ...products.map((p) => p.phone)));
  set("email", first(...companies.map((c) => c.email), ...products.map((p) => p.email)));
  set("pet_name", first(crem?.pet_name, dep?.pet_name, vet?.pet_name, ...companies.map((c) => c.pet_name)));
  set("animal", first(crem?.pet_type, dep?.pet_type, vet?.pet_type));

  // 接送（接送訂金優先，否則火化預約）
  // 接送日期／時間只跟接送訂金；火化日期及時間另記在「火化與儀式」
  set("arrival_date", first(dep?.service_date));
  set("arrival_time", first(dep?.service_time));
  set("pickup_from", first(dep?.pickup_address, crem?.pickup_address, vet?.pickup_address));

  // 套餐及儀式
  const plan = str(crem?.plan);
  const planKey = Object.keys(PLAN_CODES).find((k) => plan.includes(k));
  if (planKey) {
    set("package_name", PLAN_CODES[planKey].en.split(" ")[0]);
    set("package_code", PLAN_CODES[planKey].code);
  } else set("package_name", plan);
  const ceremony = str(crem?.service_date);
  set("ceremony_or_order_date", ceremony);
  set("ceremony_time", first(crem?.service_time));
  const codeDate = ceremony || hkDate(any.map((r) => str(r.created_at || r.shopify_created_at)).filter(Boolean).sort()[0]);
  if (codeDate) set("date_code", `${codeDate.slice(5, 7)}${codeDate.slice(0, 4)}`);

  // 金額：火化項目（套餐、加購、附加費）以開新單明細為準；網上商店紀念品計入加購
  const cremCompany = companies.find((c) => crem && c.linked_id === crem.id);
  const lines = ((cremCompany?.details as { lines?: { label: string; price?: number; quantity?: number }[] } | undefined)?.lines || []);
  const lineSum = (pred: (label: string) => boolean) => lines.filter((l) => pred(String(l.label))).reduce((n, l) => n + num(l.price) * (l.quantity || 1), 0);
  const cremGross = num(crem?.payment_amount);
  const packagePrice = lines.length ? lineSum(isPlanLabel) : cremGross;
  const surcharge = lineSum((l) => l.startsWith("附加費"));
  const companyAddons = lineSum((l) => !isPlanLabel(l) && !l.startsWith("附加費"));
  // 未連結服務記錄的開單（紀念品／其他）；已付款並已同步為 Shopify 訂單的，由紀念品訂單計算，避免重複
  const productOrderIds = new Set(products.map((p) => str(p.shopify_order_id)).filter(Boolean));
  const otherCompany = companies.filter((c) => !c.linked_id && str(c.order_type) !== "deposit" && !(c.shopify_order_id && productOrderIds.has(str(c.shopify_order_id))));
  const productTotal = products.reduce((n, p) => n + num(p.total_amount), 0) + otherCompany.reduce((n, c) => n + num(c.amount), 0);
  const vetGross = num(vet?.payment_amount);
  const invoiceAmount = cremGross + vetGross + productTotal;
  if (crem) set("package_price", packagePrice);
  if (lines.length || productTotal) set("memorial_addon_price", companyAddons + productTotal);
  if (surcharge || vetGross) set("other_surcharge", surcharge + vetGross);
  if (invoiceAmount) set("invoice_amount", invoiceAmount);

  // 已收訂金及待付餘額（待付＝發票金額－已收訂金－其他已付金額）
  const depositReceived = deps.filter((d) => str(d.payment_status) === "paid").reduce((n, d) => n + num(d.payment_amount), 0);
  if (depositReceived) set("deposit_received", depositReceived);
  const paidOthers =
    (crem && str(crem.payment_status) === "paid" ? cremGross - num(crem.deposit_credit) : 0) +
    (vet && str(vet.payment_status) === "paid" ? vetGross - num(vet.deposit_credit) : 0) +
    products.filter((p) => ["PAID", "PARTIALLY_REFUNDED"].includes(str(p.financial_status))).reduce((n, p) => n + num(p.total_amount), 0) +
    otherCompany.filter((c) => str(c.status) === "paid").reduce((n, c) => n + num(c.amount), 0);
  if (invoiceAmount) set("balance_settled", Math.max(0, invoiceAmount - depositReceived - paidOthers));

  // 其他
  set("referral", first(...companies.map((c) => c.referrer_phone)));
  set("customer_order_date", hkDate(any.map((r) => str(r.created_at || r.shopify_created_at)).filter(Boolean).sort()[0]));
  set("row_status", crem ? ROW_STATUS[str(crem.status)] || "Appointment Made" : dep || vet ? "Appointment Made" : "");
  return out;
}
