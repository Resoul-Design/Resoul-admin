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
) {
  const current = currentInput;
  const driver = text(current.driver);
  const urn = text(current.urn || current.urn_name || current.urn_type);
  const driverRow = driver
    ? logisticsRows.find((row) => same(row.driver, driver) && money(row.driver_or_gogovan_cost) > 0)
    : undefined;
  const urnRow = urn
    ? logisticsRows.find((row) => same(row.urn || row.urn_name || row.urn_type, urn) && money(row.urn_cost) > 0)
    : undefined;

  const lineTotal = productLines.reduce((sum, row) => {
    const amount = money(row.amount) || money(row.unit_price) * Math.max(1, money(row.quantity));
    return sum + amount;
  }, 0);
  const productOrderTotal = productOrders.reduce((sum, row) => sum + money(row.amount || row.total_price), 0);
  const companyProductTotal = companyOrders
    .filter((row) => text(row.order_type) === "product")
    .reduce((sum, row) => sum + money(row.amount || row.total_price), 0);

  return {
    memorial_addon_price: lineTotal || productOrderTotal || companyProductTotal || money(current.memorial_addon_price),
    driver_or_gogovan_cost: money(driverRow?.driver_or_gogovan_cost) || money(current.driver_or_gogovan_cost),
    urn_cost: money(urnRow?.urn_cost) || money(current.urn_cost),
  };
}
