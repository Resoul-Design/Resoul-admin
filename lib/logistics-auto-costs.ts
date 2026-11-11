type DataRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function same(a: unknown, b: unknown) {
  return text(a).toLocaleLowerCase("zh-Hant") === text(b).toLocaleLowerCase("zh-Hant");
}

export function expandedLogisticsRow(row: DataRow): DataRow {
  const raw = row.raw_row;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as DataRow), ...row } : row;
}

export function deriveLogisticsCosts(currentInput: DataRow, logisticsInput: DataRow[], productOrders: DataRow[], companyOrders: DataRow[]) {
  const current = expandedLogisticsRow(currentInput);
  const rows = logisticsInput.map(expandedLogisticsRow);
  const driver = text(current.driver);
  const urn = text(current.urn || current.urn_name || current.urn_type);

  const driverMatch = driver
    ? rows.find((row) => same(row.driver, driver) && money(row.driver_or_gogovan_cost) > 0)
    : undefined;
  const urnMatch = urn
    ? rows.find((row) => same(row.urn || row.urn_name || row.urn_type, urn) && money(row.urn_cost) > 0)
    : undefined;

  const companyProductTotal = companyOrders
    .filter((row) => text(row.order_type) === "product")
    .reduce((sum, row) => sum + money(row.amount), 0);
  const productOrderTotal = productOrders.reduce((sum, row) => sum + money(row.amount || row.total_price), 0);
  const memorialTotal = companyProductTotal || productOrderTotal || money(current.memorial_addon_price);

  return {
    memorial_addon_price: memorialTotal,
    driver_or_gogovan_cost: money(driverMatch?.driver_or_gogovan_cost) || money(current.driver_or_gogovan_cost),
    urn_cost: money(urnMatch?.urn_cost) || money(current.urn_cost),
  };
}