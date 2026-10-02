// 營運指標（報表與匯出頁）：純計算，不讀資料庫，方便測試
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { phoneKey } from "@/lib/product-orders";

export type MetricBooking = {
  created_at: string;
  case_no: string | null;
  notes: string | null;
  contact: string | null;
  plan: string | null;
  status: string;
  source: string | null;
  service_date: string | null;
  amount: number | null;
  payment_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
};
export type MetricDeposit = {
  created_at: string;
  notes: string | null;
  contact: string | null;
  status: string;
  service_date: string | null;
  payment_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
};
export type MetricOrder = {
  shopify_created_at: string;
  phone: string | null;
  total_amount: number;
  financial_status: string | null;
  cancelled_at: string | null;
  line_items: { attributes?: { key?: string; value?: string }[] }[] | null;
};

export type Ratio = { num: number; den: number };
export type MonthMetrics = {
  month: string;
  inquiries: { pickup: number; cremation: number; vet: number };
  depositPaid: Ratio;
  depositToCremation: Ratio;
  plans: { plan: string; count: number }[];
  avgDaysToService: number | null;
  avgDaysSample: number;
  income: { cremation: number; pickup: number; product: number; total: number };
  avgCremation: number | null;
  keepsakeAttach: Ratio;
};

export const PLANS = ["風之旅", "雲之旅", "星之旅"];
const DAY = 24 * 60 * 60 * 1000;

// 香港時間的年月（建立時間等時間戳）
export function hkMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 8 * 60 * 60 * 1000).toISOString().slice(0, 7) : "";
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const isVet = (b: MetricBooking) => (b.source || "").includes("euthanasia");
const rslOf = (...v: (string | null | undefined)[]) => {
  const no = canonicalProjectNo(...v);
  return no === "—" ? "" : no;
};

export function computeMonthMetrics(
  month: string,
  bookingsAll: MetricBooking[],
  deposits: MetricDeposit[],
  orders: MetricOrder[]
): MonthMetrics {
  const vet = bookingsAll.filter(isVet);
  const cremation = bookingsAll.filter((b) => !isVet(b));
  const created = <T extends { created_at: string }>(rows: T[]) => rows.filter((r) => hkMonth(r.created_at) === month);

  // 1. 新查詢（按建立月份，包括已取消）
  const depMonth = created(deposits);
  const cremMonth = created(cremation);
  const inquiries = { pickup: depMonth.length, cremation: cremMonth.length, vet: created(vet).length };

  // 2. 訂金付款率：該月落單的接送訂金中，已付款（不計已取消）
  const depActive = depMonth.filter((d) => d.status !== "cancelled");
  const depPaidRows = depActive.filter((d) => d.payment_status === "paid");
  const depositPaid = { num: depPaidRows.length, den: depActive.length };

  // 3. 訂金轉火化率：該月已付訂金中，有對應火化預約（同一 RSL 專案編號或同一電話）
  const cremByNo = new Set(cremation.filter((b) => b.status !== "cancelled").map((b) => rslOf(b.case_no, projectNoFromNotes(b.notes))).filter(Boolean));
  const cremByPhone = new Set(cremation.filter((b) => b.status !== "cancelled").map((b) => phoneKey(b.contact)).filter(Boolean));
  const converted = depPaidRows.filter((d) => {
    const no = rslOf(projectNoFromNotes(d.notes));
    const ph = phoneKey(d.contact);
    return (!!no && cremByNo.has(no)) || (!!ph && cremByPhone.has(ph));
  });
  const depositToCremation = { num: converted.length, den: depPaidRows.length };

  // 4. 方案分佈：該月建立、未取消的火化預約
  const cremActive = cremMonth.filter((b) => b.status !== "cancelled");
  const plans = [...PLANS, "未選方案"].map((plan) => ({
    plan,
    count: cremActive.filter((b) => (plan === "未選方案" ? !PLANS.includes(b.plan || "") : b.plan === plan)).length,
  }));

  // 5. 平均處理時間：服務日在該月、已完成的火化預約，由收到預約到服務日的日數
  const done = cremation.filter((b) => b.status === "completed" && (b.service_date || "").startsWith(month));
  const days = done
    .map((b) => (Date.parse(b.service_date + "T00:00:00+08:00") - Date.parse(b.created_at)) / DAY)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgDaysToService = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;

  // 6. 收入（與「財務管理」相同口徑：火化／接送按付款月份，紀念品按訂單月份）
  const payMonth = (paid: string | null, service: string | null, createdAt: string) => (paid || service || createdAt || "").slice(0, 7);
  const cremPaid = cremation.filter((b) => b.payment_status === "paid" && payMonth(b.paid_at, b.service_date, b.created_at) === month);
  const cremIncome = cremPaid.reduce((n, b) => n + Number(b.amount ?? b.payment_amount ?? 0), 0);
  const pickupIncome = deposits
    .filter((d) => d.payment_status === "paid" && d.status !== "cancelled" && payMonth(d.paid_at, d.service_date, d.created_at) === month)
    .reduce((n, d) => n + Number(d.payment_amount || 0), 0);
  const validOrder = (o: MetricOrder) => !o.cancelled_at && !["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(o.financial_status || "");
  const productIncome = orders
    .filter((o) => validOrder(o) && o.shopify_created_at.slice(0, 7) === month)
    .reduce((n, o) => n + Number(o.total_amount || 0), 0);
  const income = { cremation: cremIncome, pickup: pickupIncome, product: productIncome, total: cremIncome + pickupIncome + productIncome };
  const avgCremation = cremPaid.length ? cremIncome / cremPaid.length : null;

  // 7. 紀念品加購率：該月建立、未取消的火化預約中，有紀念品訂單（同一電話或訂單帶同一 RSL 編號）
  const orderPhones = new Set(orders.filter(validOrder).map((o) => phoneKey(o.phone)).filter(Boolean));
  const orderNos = new Set(
    orders
      .filter(validOrder)
      .flatMap((o) => (o.line_items || []).flatMap((l) => l.attributes || []))
      .filter((a) => /project|專案/i.test(a.key || ""))
      .map((a) => rslOf(a.value))
      .filter(Boolean)
  );
  const attached = cremActive.filter((b) => {
    const ph = phoneKey(b.contact);
    const no = rslOf(b.case_no, projectNoFromNotes(b.notes));
    return (!!ph && orderPhones.has(ph)) || (!!no && orderNos.has(no));
  });
  const keepsakeAttach = { num: attached.length, den: cremActive.length };

  return {
    month,
    inquiries,
    depositPaid,
    depositToCremation,
    plans,
    avgDaysToService,
    avgDaysSample: days.length,
    income,
    avgCremation,
    keepsakeAttach,
  };
}
