import assert from "node:assert/strict";
import test from "node:test";
import { logisticsSavePatch } from "./logistics-auto-costs";
import { canonicalDriver } from "./driver-names";
import { computeLogistics, lineTotals } from "./logistics-calc";
import { classifyOrderPayment, legacyMoneyNote, selectPlanSku, splitCreditAndPromo, summarizeDeposits } from "./money-rules";
import { sumMemorialLines } from "./memorial-total";
import { isExactTime, preserveServiceTime } from "./service-time";
import { lookupUrnCost } from "./urn-cost";

test("訂金抵扣與折扣分開，抵扣不會超過 Shopify 折扣總額", () => {
  assert.deepEqual(splitCreditAndPromo(1800, 1800), { credit: 1800, other: 0 });
  assert.deepEqual(splitCreditAndPromo(2000, 1800), { credit: 1800, other: 200 });
  assert.deepEqual(splitCreditAndPromo(0, 1800), { credit: 0, other: 0 });
});

test("作廢、全額退款不計已收；部分退款只計淨額", () => {
  assert.equal(classifyOrderPayment("PAID", false, 1800, 0).net, 1800);
  assert.equal(classifyOrderPayment("REFUNDED", false, 1800, 1800).net, 0);
  assert.equal(classifyOrderPayment("PARTIALLY_REFUNDED", false, 1800, 500).net, 1300);
  assert.equal(classifyOrderPayment("VOIDED", false, 1800, 0).net, 0);
  assert.equal(classifyOrderPayment("PAID", true, 1800, 0).paid, false);
});

test("已付接送訂金：Shopify 淨額、人手已收，以及讀取失敗不可變 0", () => {
  const paid = summarizeDeposits(
    [{ paymentStatus: "paid", paymentAmount: 1800, shopifyOrderId: "gid://shopify/Order/1" }],
    () => ({ found: true, paid: true, voided: false, refunded: false, net: 1800 }),
    false,
  );
  assert.equal(paid.amount, 1800);
  assert.equal(paid.source, "shopify");

  const cash = summarizeDeposits([{ paymentStatus: "paid", paymentAmount: 1800, shopifyOrderId: "" }], () => null, false);
  assert.equal(cash.amount, 1800);
  assert.equal(cash.source, "cash");

  const missing = summarizeDeposits([], () => null, false);
  assert.equal(missing.amount, 0);
  assert.equal(missing.source, "none");

  const failed = summarizeDeposits([{ paymentStatus: "paid", paymentAmount: 1800, shopifyOrderId: "gid://shopify/Order/1" }], () => null, true);
  assert.equal(failed.amount, null);

  const refunded = summarizeDeposits(
    [{ paymentStatus: "paid", paymentAmount: 1800, shopifyOrderId: "gid://shopify/Order/9" }],
    () => ({ found: true, paid: false, voided: false, refunded: true, net: 0 }),
    false,
  );
  assert.equal(refunded.amount, 0);
});

test("套餐顯示所選款式 SKU，不被其他 SJ 代碼蓋過", () => {
  assert.equal(selectPlanSku([
    { title: "相框", sku: "SJ1" },
    { title: "星之旅", variantTitle: "40kg", sku: "SJ30" },
  ]), "SJ30");
  assert.equal(selectPlanSku([{ title: "星之旅", variantTitle: "1-5kg", sku: "SJ1" }]), "SJ1");
});

test("#337 應付 800，已收 1800 不會再減一次", () => {
  const calc = computeLogistics({}, null, {
    loadError: false, hasDocs: true, depositPaid: 1800, gross: 2600, credit: 1800, other: 0, payable: 800,
  });
  assert.equal(calc.invoiceTotal, 2600);
  assert.equal(calc.depositPaid, 1800);
  assert.equal(calc.credit, 1800);
  assert.equal(calc.discount, 0);
  assert.equal(calc.balanceDue, 800);
});

test("#339 以 Shopify 為準，並標出本機舊數", () => {
  const calc = computeLogistics({ deposit_received: 1800, discount_price: 200, balance_settled: 4500 }, null, {
    loadError: false, hasDocs: true, depositPaid: 0, gross: 6500, credit: 0, other: 0, payable: 6500,
  });
  assert.equal(calc.depositPaid, 0);
  assert.equal(calc.discount, 0);
  assert.equal(calc.balanceDue, 6500);
  assert.match(legacyMoneyNote(
    { deposit: 0, discount: 0, payable: 6500 },
    { deposit: 1800, discount: 200, balance: 4500 },
  ), /未改寫/);
});

test("Shopify 讀取失敗時金額留空，不用 0", () => {
  const calc = computeLogistics({ deposit_received: 1800, package_price: 6500 }, null, {
    loadError: true, hasDocs: false, depositPaid: null, gross: null, credit: null, other: null, payable: null,
  });
  assert.equal(calc.depositPaid, null);
  assert.equal(calc.balanceDue, null);
  assert.equal(calc.invoiceTotal, null);
});

test("紀念品行加總用成交價，重覆的整單總額只計一次，相同金額但無行小計則不猜", () => {
  assert.deepEqual(sumMemorialLines([
    { amount: 4800 }, { amount: 1980 }, { amount: 1980 },
  ]), { state: "amount", amount: 8760 });
  assert.deepEqual(sumMemorialLines([
    { amount: 4920, unitPrice: 1480, quantity: 1 },
    { amount: 4920, unitPrice: 1480, quantity: 1 },
    { amount: 4920, unitPrice: 1480, quantity: 1 },
    { amount: 4920, unitPrice: 480, quantity: 1 },
  ]), { state: "amount", amount: 4920 });
  assert.deepEqual(sumMemorialLines([{ amount: 300 }, { amount: 300 }]), { state: "ambiguous" });
  assert.deepEqual(sumMemorialLines([{ amount: 0 }, { amount: 0 }]), { state: "amount", amount: 0 });
  assert.deepEqual(sumMemorialLines([]), { state: "none" });
  const totals = lineTotals([
    { id: "1", amount: 120, quantity: 1, unit_price: 120, cost: 10, suggested: false },
    { id: null, amount: 999, quantity: 1, unit_price: 999, cost: null, suggested: true },
  ]);
  assert.equal(totals.amount, 120);
  assert.equal(totals.ambiguous, false);
});

test("沒有產品行時沿用已存紀念品加購，不改成 0", () => {
  const calc = computeLogistics({ memorial_addon_price: 8760, package_price: 1000 }, { count: 0, amount: 0, ambiguous: false, cost: 0, costCount: 0 }, null);
  assert.equal(calc.memorial.value, 8760);
  assert.equal(calc.memorial.from, "saved");
});

test("骨灰龕只按明確代碼取成本；狀態標籤不猜 0", () => {
  assert.deepEqual(lookupUrnCost("URN02SP"), { state: "amount", sku: "URN02SP", amount: 35 });
  assert.deepEqual(lookupUrnCost("Premium URN - Mini Pet Upgrade (URN03UP)"), { state: "amount", sku: "URN03UP", amount: 20 });
  const engraving = lookupUrnCost("URNW");
  assert.equal(engraving.state, "amount");
  if (engraving.state === "amount") assert.equal(engraving.amount, 0);
  assert.equal(lookupUrnCost("By Package").state, "unresolved");
  assert.equal(lookupUrnCost("Upgrade").state, "unresolved");
  assert.equal(lookupUrnCost("No Urn").state, "unresolved");
  assert.equal(lookupUrnCost("").state, "empty");
  const unresolved = computeLogistics({ urn: "By Package", driver_or_gogovan_cost: 300, package_price: 1000 }, null, null);
  assert.equal(unresolved.urnCost.from, "unresolved");
  assert.equal(unresolved.grossProfit, null);
  const known = computeLogistics({ urn: "URN02SP", urn_cost: 0, driver_or_gogovan_cost: 0, package_price: 1000 }, null, null);
  assert.equal(known.urnCost.value, 35);
  assert.equal(known.urnCost.from, "catalog");
  assert.equal(known.grossProfit, 965);
});

test("司機費空白不是 0；已存 0 仍然保留", () => {
  const blank = computeLogistics({ driver_or_gogovan_cost: "", urn: "URNW", package_price: 1000 }, null, null);
  assert.equal(blank.driverCost.value, null);
  assert.equal(blank.grossProfit, null);
  const zero = computeLogistics({ driver_or_gogovan_cost: 0, urn: "URNW", package_price: 1000 }, null, null);
  assert.equal(zero.driverCost.value, 0);
  assert.equal(zero.grossProfit, 1000);
});

test("舊到達時段保持原文，精確時間才用 HH:MM", () => {
  assert.equal(isExactTime("08:30"), true);
  assert.equal(isExactTime("上午（08:00–12:00）"), false);
  assert.equal(preserveServiceTime("08:30"), "08:30");
  assert.equal(preserveServiceTime("上午（08:00–12:00）"), "上午（08:00–12:00）");
  assert.equal(preserveServiceTime("09:00-12:00"), "09:00-12:00");
});

test("保存其他欄位不會寫入接送費或未提交的費用", () => {
  const patch = logisticsSavePatch({ owner_name: "客人", pickup_fee: 1800, driver_or_gogovan_cost: 320 });
  assert.equal(patch.owner_name, "客人");
  assert.equal("pickup_fee" in patch, false);
  assert.equal(patch.driver_or_gogovan_cost, 320);
  const unrelated = logisticsSavePatch({ phone: "91234567" });
  assert.deepEqual(Object.keys(unrelated), ["phone"]);
});

test("司機別名只合併顯示，不產生車費", () => {
  assert.equal(canonicalDriver("豪仔"), "豪仔 / Ho Jai");
  assert.equal(canonicalDriver("Ho Jai"), "豪仔 / Ho Jai");
  assert.equal(canonicalDriver("O2 Team"), "Yeah O2");
  assert.equal(canonicalDriver("Ricky "), "Ricky");
  assert.equal(canonicalDriver("Vivian's dad"), "V's Dad");
  assert.equal(canonicalDriver("N/A"), "");
});
