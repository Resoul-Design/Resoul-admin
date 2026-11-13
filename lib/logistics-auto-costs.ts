// 客戶資料自動成本（顯示及保存共用，兩邊數字一致）：
//   紀念品加購＝已保存的紀念品產品行加總（不含淡黃色建議行及 Shopify 已刪除的行）；沒有產品行時用已付款紀念品訂單或開單記錄
//   司機／GoGoVan 費用＝該司機的標準收費（試算表匯入記錄最常見的金額，lib/drivers.ts driverFees）；沒有對照時用最近一筆同司機記錄
//   骨灰龕成本＝骨灰龕產品代碼對照成本表（lib/urn-costs.ts）；不是產品代碼時用最近一筆同骨灰龕記錄
import { canonicalDriver } from "@/lib/driver-names";
import { urnCost } from "@/lib/urn-costs";

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const same = (a: unknown, b: unknown) => text(a).toLocaleLowerCase("zh-Hant") === text(b).toLocaleLowerCase("zh-Hant");

export function deriveLogisticsAutoCosts(
  currentInput: Row,
  logisticsRows: Row[] = [],
  productLines: Row[] = [],
  productOrders: Row[] = [],
  companyOrders: Row[] = [],
  driverFees: Record<string, number> = {},
) {
  const current = currentInput;
  const driver = text(current.driver);
  const urn = text(current.urn || current.urn_name || current.urn_type);
  const standardFee = driver ? driverFees[canonicalDriver(driver)] : undefined;
  const driverRow = driver && standardFee == null
    ? logisticsRows.find((row) => same(canonicalDriver(text(row.driver)), canonicalDriver(driver)) && money(row.driver_or_gogovan_cost) > 0)
    : undefined;
  const tableUrnCost = urn ? urnCost(urn) : null;
  const urnRow = urn && tableUrnCost == null
    ? logisticsRows.find((row) => same(row.urn || row.urn_name || row.urn_type, urn) && money(row.urn_cost) > 0)
    : undefined;

  const savedLines = productLines.filter((row) => row.id && !row.suggested && !row.missing);
  const lineTotal = savedLines.reduce((sum, row) => {
    const amount = row.amount != null && row.amount !== "" ? money(row.amount) : money(row.unit_price) * Math.max(1, money(row.quantity));
    return sum + amount;
  }, 0);
  const productOrderTotal = productOrders.filter((row) => !row.cancelled_at).reduce((sum, row) => sum + money(row.total_amount ?? row.amount ?? row.total_price), 0);
  const companyProductTotal = companyOrders
    .filter((row) => text(row.order_type) === "product" && text(row.status) !== "cancelled")
    .reduce((sum, row) => sum + money(row.amount || row.total_price), 0);

  return {
    memorial_addon_price: savedLines.length ? lineTotal : productOrderTotal || companyProductTotal || money(current.memorial_addon_price),
    driver_or_gogovan_cost: standardFee ?? (money(driverRow?.driver_or_gogovan_cost) || money(current.driver_or_gogovan_cost)),
    urn_cost: tableUrnCost ?? (money(urnRow?.urn_cost) || money(current.urn_cost)),
  };
}
