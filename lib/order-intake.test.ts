import assert from "node:assert/strict";
import test from "node:test";
import { EXCEL_DRIVERS } from "./driver-names";
import { buildBundleIntent, createMemoryGateway, runIntakeBundle, verifyPersisted, type PersistedService } from "./order-bundle";
import { bundleKeyOf, hkTimestamp, prepareIntake, previewSource, reviewRow, serviceToken, type DepositQuote, type ExistingIdentity, type OfficialVariant, type SourceValues } from "./order-intake";
import { opcText, readOpcConfig, recordOpc } from "./opc-log";

const catalog: OfficialVariant[] = [
  { id: "gid://shopify/ProductVariant/1", sku: "RS-DEPOSIT", title: "標準", productTitle: "預約接送訂金", productType: "deposit", price: 1800 },
  { id: "gid://shopify/ProductVariant/2", sku: "SJ30", title: "30-40kg", productTitle: "星之旅", productType: "cremation", price: 4800 },
  { id: "gid://shopify/ProductVariant/3", sku: "SJ10", title: "0-10kg", productTitle: "星之旅", productType: "cremation", price: 2200 },
  { id: "gid://shopify/ProductVariant/4", sku: "URN06", title: "標準", productTitle: "骨灰龕", productType: "product", price: 900 },
  { id: "gid://shopify/ProductVariant/5", sku: "URN00", title: "套餐包括", productTitle: "骨灰龕", productType: "product", price: 0 },
  { id: "gid://shopify/ProductVariant/6", sku: "PRC01", title: "標準", productTitle: "平安伴", productType: "product", price: 380 },
];

const deposit: DepositQuote = { catalog: { amount: 1800, variantId: catalog[0].id, sku: "RS-DEPOSIT" }, envAmount: null, establishedDefault: null };

const header = "單號,訂單狀態,主人姓名,聯絡電話,寵物名稱,動物類型,品種,重量（公斤）,到達日期,到達時間,接送地點,司機,套餐,套餐代碼,套餐價格,火化／訂單日期,火化時間,告別日期,骨灰龕,骨灰龕取回日期,備註,已收訂金,司機費用結算日,日期代碼,客人下單日期";

function line(cells: Record<string, string>): string {
  const keys = header.split(",");
  return keys.map((k) => cells[k] || "").join(",");
}

function ready(over: Record<string, string> = {}): string {
  return line({
    單號: "279", 訂單狀態: "Appointment Made", 主人姓名: "合成主人甲", 聯絡電話: "90000001", 寵物名稱: "合成寵物甲", 動物類型: "貓", 品種: "唐貓",
    "重量（公斤）": "32", 到達日期: "2026-11-26", 到達時間: "10:30", 接送地點: "合成地址甲", 司機: "Ricky", 套餐: "星之旅", 套餐代碼: "SJ30", 套餐價格: "4800",
    "火化／訂單日期": "2026-11-27", 火化時間: "11:00", 告別日期: "2026-11-26", 骨灰龕: "By Package", 骨灰龕取回日期: "2026-11-27", 備註: "備註甲-UNIQUE",
    ...over,
  });
}

function preview(rows: string[], extra?: Partial<Parameters<typeof prepareIntake>[0]>) {
  return prepareIntake({
    logisticsCsv: [header, ...rows].join("\n"),
    source: { fileName: "synthetic.csv", location: "合成位置", fetchedAtHk: "2026-11-25T18:00:00+08:00" },
    catalog,
    deposit,
    drivers: [...EXCEL_DRIVERS],
    existing: [],
    backendChecked: true,
    now: new Date("2026-11-25T10:00:00Z"),
    ...extra,
  });
}

test("只接受大於 278 的正式號，排除取消、測試、附加單，並由小到大", () => {
  const result = preview([
    ready({ 單號: "285" }),
    ready({ 單號: "278", 主人姓名: "舊主人", 聯絡電話: "90000002", 寵物名稱: "舊寵物", 備註: "舊備註" }),
    ready({ 單號: "300", 訂單狀態: "Cancelled", 主人姓名: "取消主人", 聯絡電話: "90000003", 寵物名稱: "取消寵物", 備註: "取消備註" }),
    ready({ 單號: "301", 訂單狀態: "TEST", 主人姓名: "測試主人", 聯絡電話: "90000004", 寵物名稱: "測試寵物", 備註: "測試備註" }),
    "301B,Appointment Made,附加主人,90000005,附加寵物,貓,唐貓,32,2026-11-26,10:30,地址,Ricky,星之旅,SJ30,4800,2026-11-27,11:00,,,備註",
    ready(),
  ], { backendOnlyNumbers: [350] });
  assert.deepEqual(result.rows.map((r) => r.formalNo), [279, 285]);
  assert.equal(result.rows.some((r) => r.formalNo === 350), false);
  assert.ok(result.excluded.some((e) => e.formalNo === 278));
  assert.ok(result.excluded.some((e) => e.formalNo === 300 && e.reason.includes("取消")));
  assert.ok(result.excluded.some((e) => e.formalNo === 301 && e.reason.includes("測試")));
  assert.ok(result.excluded.some((e) => e.reason.includes("附加")));
  assert.equal(result.source.previewedAtHk.endsWith("+08:00"), true);
  assert.equal(hkTimestamp(new Date("2026-11-25T10:00:00Z")), "2026-11-25T18:00:00+08:00");
});

test("查重要正式號加主人、寵物、電話及重量到達；同名不足以合併", () => {
  const result = preview([
    ready(),
    ready({ 備註: "另一行但同一指紋" }),
    ready({ 單號: "280", 主人姓名: "合成主人乙", 聯絡電話: "90000009", 寵物名稱: "合成寵物甲", 備註: "同名不同電話" }),
    ready({ 單號: "281", 主人姓名: "衝突主人", 聯絡電話: "90000008", 寵物名稱: "衝突寵物", 備註: "衝突" }),
    ready({ 單號: "281", 主人姓名: "另一衝突", 聯絡電話: "90000007", 寵物名稱: "另一寵物", 備註: "衝突二" }),
  ]);
  const row279 = result.rows.find((r) => r.formalNo === 279);
  assert.equal(row279?.dedup, "duplicate_kept");
  assert.equal(row279?.notesDeposit.includes("另一行但同一指紋"), false);
  assert.equal(row279?.notesDeposit.includes("備註甲-UNIQUE"), true);
  const sameName = result.rows.find((r) => r.formalNo === 280);
  assert.equal(sameName?.dedup, "unique");
  assert.equal(sameName?.mode, "new");
  const conflict = result.rows.find((r) => r.formalNo === 281);
  assert.equal(conflict?.dedup, "conflict");
  assert.equal(conflict?.submittable, false);
});

test("指紋全同但正式號不同時不開新單", () => {
  const result = preview([
    ready(),
    ready({ 單號: "290" }),
  ]);
  assert.equal(result.rows.every((r) => r.dedup === "cross" && !r.submittable), true);
});

test("套餐記號、重量、官方價與免費骨灰龕", () => {
  const result = preview([
    ready({ 單號: "282", 套餐代碼: "\"", 套餐: "\"", 套餐價格: "", 備註: "唔好抄上一位" }),
    ready({ 單號: "283", 套餐: "TBC", 套餐代碼: "", 套餐價格: "#N/A", "重量（公斤）": "約32", 備註: "大約" }),
    ready({ 單號: "284", 套餐價格: "1", 備註: "價錢不符" }),
    ready({ 單號: "286", 套餐價格: "", 備註: "空白價格" }),
    ready({ 單號: "287", 套餐: "預算價", 套餐代碼: "", 備註: "預算" }),
    ready({ 單號: "288", "重量（公斤）": "12", 備註: "重量不符" }),
  ]);
  const ditto = result.rows.find((r) => r.formalNo === 282)!;
  assert.equal(ditto.package.confirmed, false);
  assert.equal(ditto.package.sku, null);
  assert.equal(ditto.notesDeposit.includes("備註甲-UNIQUE"), false);
  const approx = result.rows.find((r) => r.formalNo === 283)!;
  assert.equal(approx.package.confirmed, false);
  assert.equal(approx.pet.weightApproximate, true);
  assert.ok(approx.pendingFields.some((f) => f.includes("實際重量")));
  assert.equal(result.rows.find((r) => r.formalNo === 284)?.package.confirmed, false);
  const blank = result.rows.find((r) => r.formalNo === 286)!;
  assert.equal(blank.package.confirmed, true);
  assert.equal(blank.package.officialPrice, 4800);
  assert.match(blank.package.reason, /不是已確認 0/);
  assert.equal(result.rows.find((r) => r.formalNo === 287)?.package.confirmed, false);
  assert.equal(result.rows.find((r) => r.formalNo === 288)?.package.confirmed, false);
});

test("已確認套餐連同付費產品；套餐已包骨灰龕 0 元不另開", () => {
  const memorial = [
    "Customer Number,Pet Name,Product Code,Product,Unit,Prodcut price - pre Unit,Product Status",
    "279,合成寵物甲,URN00,套餐包括骨灰龕,1,0,Pending",
    "279,合成寵物甲,URN06,加購骨灰龕,1,900,Pending",
    "279,合成寵物甲,PRC01,平安伴,1,380,Pending",
    "279,合成寵物甲,,同上,1,,Pending",
  ].join("\n");
  const result = preview([ready()], { memorialCsv: memorial });
  const row = result.rows[0];
  assert.equal(row.package.confirmed, true);
  assert.deepEqual(row.products.map((p) => p.sku).sort(), ["PRC01", "URN06"]);
  assert.ok(row.questions.some((q) => q.code === "product_unconfirmed"));
});

test("告別日期不寫進火化欄；時間維持來源鐘點", () => {
  const result = preview([ready({ 到達時間: "6:30 PM", 火化時間: "6:30 PM" })]);
  const row = result.rows[0];
  assert.equal(row.pickup.time, "18:30");
  assert.equal(row.cremation?.time, "18:30");
  assert.equal(row.cremation?.date, "2026-11-27");
  assert.equal(row.farewellDate, "2026-11-26");
  assert.match(row.notesCremation, /告別日期/);
  assert.equal(row.notesDeposit.includes("告別日期"), false);
  assert.equal("farewellTime" in row, false);
});

test("沒有付款證據只可待付款；黃色建議沒有來源就不採用", () => {
  const result = preview([ready({ 已收訂金: "1800", 司機費用結算日: "2026-11-20", 日期代碼: "", 客人下單日期: "" })]);
  const row = result.rows[0];
  assert.equal(row.payment.status, "pending");
  assert.equal(row.payment.intent, "link");
  assert.ok(row.questions.some((q) => q.code === "payment_not_evidence" && !q.blocking));
  assert.ok(row.questions.some((q) => q.code === "driver_settlement_not_payment"));
  assert.equal(row.backed.rowStatus, "Appointment Made");
  assert.deepEqual(row.withheldSuggestions.sort(), ["日期代碼", "客人下單日期"].sort());
  assert.equal(row.backed.dateCode, undefined);
});

test("沒有官方訂金 SKU 時不把 1800 當成已確認", () => {
  const result = preview([ready()], { deposit: { catalog: null, envAmount: null, establishedDefault: { amount: 1800, source: "lib/deposit-amount.ts DEPOSIT_AMOUNT" } } });
  assert.equal(result.rows[0].deposit.amount, null);
  assert.equal(result.rows[0].submittable, false);
  assert.match(result.rows[0].questions.map((q) => q.text).join(""), /1800/);
});

test("目錄價與 DEPOSIT_AMOUNT 不一致時不代選", () => {
  const result = preview([ready()], { deposit: { catalog: deposit.catalog, envAmount: 2000, establishedDefault: null } });
  assert.equal(result.rows[0].deposit.amount, null);
  assert.ok(result.rows[0].questions.some((q) => q.code === "deposit_price_unconfirmed"));
});

test("後台未查重、已取消、指紋不符或已有同一專案", () => {
  const unchecked = preview([ready()], { backendChecked: false });
  assert.equal(unchecked.rows[0].submittable, false);
  const existing: ExistingIdentity = {
    formalNo: 279, projectNo: "279", invoiceNo: 279, owner: "合成主人甲", pet: "合成寵物甲", phone: "90000001",
    weightKg: 32, arrivalDate: "2026-11-26", arrivalTime: "10:30", canceled: false, hasDeposit: true, hasCremation: false,
  };
  const reuse = preview([ready()], { existing: [existing] });
  assert.equal(reuse.rows[0].mode, "reuse");
  assert.equal(reuse.rows[0].existingProjectNo, "279");
  assert.equal(reuse.rows[0].hasExistingDeposit, true);
  const canceled = preview([ready()], { existing: [{ ...existing, canceled: true, hasDeposit: false }] });
  assert.equal(canceled.rows[0].mode, "blocked");
  const clash = preview([ready()], { existing: [{ ...existing, pet: "另一隻" }] });
  assert.equal(clash.rows[0].mode, "blocked");
});

test("填司機只影響該行，備註不會抄前一位", () => {
  const result = preview([
    ready({ 司機: "", 備註: "甲的備註" }),
    ready({ 單號: "292", 主人姓名: "合成主人丙", 聯絡電話: "90000011", 寵物名稱: "合成寵物丙", 司機: "", 備註: "同上", 接送地點: "合成地址丙" }),
  ]);
  const first = reviewRow(result.rows[0], { driver: "Ricky" }, [...EXCEL_DRIVERS]);
  const second = reviewRow(result.rows[1], { driver: "Joe" }, [...EXCEL_DRIVERS]);
  assert.equal(first.pickup.driver, "Ricky");
  assert.equal(second.pickup.driver, "Joe");
  assert.equal(second.notesDeposit.includes("甲的備註"), false);
  assert.equal(second.questions.some((q) => q.code === "note_ditto"), true);
  const cleared = reviewRow(result.rows[1], { driver: "Joe", note: "" }, [...EXCEL_DRIVERS]);
  assert.equal(cleared.questions.some((q) => q.code === "note_ditto"), false);
  assert.equal(cleared.notesDeposit.includes("甲的備註"), false);
});

test("一次提交同一專案；重試不重複；失敗後續做不重開押金", async () => {
  const row = preview([ready()]).rows[0];
  const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.intent.cremation);
  assert.equal(built.intent.deposit.projectNo, null);
  const gateway = createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }) });
  const first = await runIntakeBundle(built.intent, gateway);
  assert.equal(first.business, "verified");
  assert.equal(first.complete, true);
  assert.equal(first.services.length, 2);
  assert.equal(new Set(first.services.map((s) => s.projectNo)).size, 1);
  assert.equal(first.services.find((s) => s.type === "deposit")?.driverField, "Ricky");
  assert.equal(gateway.creates, 2);
  const second = await runIntakeBundle(built.intent, gateway);
  assert.equal(second.business, "verified");
  assert.equal(gateway.creates, 2);
  assert.equal(gateway.rows.length, 2);
});

test("中途失敗可再試，且編號不一致時不得完成", async () => {
  const row = preview([ready()]).rows[0];
  const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const flaky = createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }), failTypes: [{ type: "cremation", times: 1 }] });
  const failed = await runIntakeBundle(built.intent, flaky);
  assert.equal(failed.business, "incomplete");
  assert.equal(failed.complete, false);
  assert.equal(failed.recoverable, true);
  assert.equal(flaky.creates, 1);
  const retried = await runIntakeBundle(built.intent, flaky);
  assert.equal(retried.business, "verified");
  assert.equal(flaky.creates, 2);
  assert.equal(flaky.rows.filter((r) => r.type === "deposit").length, 1);

  const mismatched = createMemoryGateway({ allocate: () => ({ invoiceNo: 351, projectNo: "351" }) });
  const mismatch = await runIntakeBundle(built.intent, mismatched);
  assert.equal(mismatch.business, "mismatch");
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.verify?.formalAligned, false);
  assert.ok(mismatch.verify?.actionable.some((a) => a.includes("不會自動改號")));
});

test("司機只在備註、第二個專案、金額或識別碼混淆都不能通過", async () => {
  const row = preview([ready()]).rows[0];
  const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const notesOnly = createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }), driverOnlyInNotes: true });
  const driverResult = await runIntakeBundle(built.intent, notesOnly);
  assert.equal(driverResult.verify?.driverIndependent, false);
  assert.equal(driverResult.complete, false);

  let seq = 400;
  const split = createMemoryGateway({ allocate: () => { seq += 1; return { invoiceNo: seq, projectNo: String(seq) }; }, ignorePassedProject: true });
  const splitResult = await runIntakeBundle(built.intent, split);
  assert.equal(splitResult.business, "incomplete");
  assert.notEqual(splitResult.complete, true);

  const good = createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }) });
  const verified = await runIntakeBundle(built.intent, good);
  const broken: PersistedService[] = verified.services.map((s) => ({ ...s, companyOrderId: String(s.invoiceNo), amount: s.amount + 1 }));
  const verdict = verifyPersisted(built.intent, broken);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.issues.some((i) => i.code === "id_kind_mismatch"));
  assert.ok(verdict.issues.some((i) => i.code === "amount"));
});

test("套餐未確認時只建立押金，待確認欄位仍可見", async () => {
  const result = preview([ready({ 單號: "293", 套餐: "TBC", 套餐代碼: "", 套餐價格: "", 主人姓名: "合成主人丁", 聯絡電話: "90000012", 寵物名稱: "合成寵物丁", 備註: "只開押金" })]);
  const row = result.rows[0];
  assert.equal(row.package.confirmed, false);
  assert.ok(row.pendingFields.some((f) => f.includes("套餐")));
  const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.intent.cremation, null);
  const gateway = createMemoryGateway({ allocate: () => ({ invoiceNo: 293, projectNo: "293" }) });
  const run = await runIntakeBundle(built.intent, gateway);
  assert.equal(run.services.length, 1);
  assert.equal(run.services[0].type, "deposit");
  assert.equal(run.business, "verified");
});

test("沿用已有押金時不開第二張，也不改舊金額", async () => {
  const row = preview([ready()], { existing: [{
    formalNo: 279, projectNo: "279", invoiceNo: 279, owner: "合成主人甲", pet: "合成寵物甲", phone: "90000001",
    weightKg: 32, arrivalDate: "2026-11-26", arrivalTime: "10:30", canceled: false, hasDeposit: true, hasCremation: false,
  }] }).rows[0];
  const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.intent.adoptDeposit, true);
  const gateway = createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }) });
  gateway.rows.push(seed(built.intent.deposit.token, "deposit", 1800));
  const before = gateway.rows.length;
  const run = await runIntakeBundle(built.intent, gateway);
  assert.equal(gateway.rows.filter((r) => r.type === "deposit").length, 1);
  assert.ok(gateway.rows.length >= before);
  assert.equal(run.services.filter((s) => s.type === "deposit").length, 1);
  assert.notEqual(run.services.find((s) => s.type === "deposit")?.amount, 1);
});

test("OPC 未設定、讀回成功與失敗分開；紀錄不含個人資料", async () => {
  const missing = readOpcConfig({});
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.deepEqual(missing.missing, ["OPC_NOTION_TOKEN", "OPC_NOTION_PAGE_ID"]);
  const summary = { atHk: "2026-11-25T18:00:00+08:00", formalNo: 279, business: "verified" as const, serviceCount: 2, amounts: [{ type: "deposit" as const, amount: 1800 }, { type: "cremation" as const, amount: 4800 }], payment: "pending" as const, driverIndependent: true, formalAligned: true, elapsedMs: 1200 };
  const text = opcText(summary);
  assert.equal(text.includes("90000001"), false);
  assert.equal(text.includes("合成"), false);
  assert.match(text, /待審核/);
  assert.match(text, /無期限/);
  const notConfigured = await recordOpc(summary, {});
  assert.equal(notConfigured.status, "not_configured");
  const calls: { url: string; method?: string; body?: string }[] = [];
  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (init?.method === "PATCH") return { ok: true, status: 200, text: async () => JSON.stringify({ results: [{ id: "block-1" }] }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ paragraph: { rich_text: [{ plain_text: text }] } }) };
  };
  const logged = await recordOpc(summary, { OPC_NOTION_TOKEN: "secret-token", OPC_NOTION_PAGE_ID: "page-1" }, fetchImpl);
  assert.equal(logged.status, "logged");
  assert.equal(calls[0].method, "PATCH");
  assert.match(calls[0].url, /\/blocks\/page-1\/children$/);
  assert.equal(calls.some((c) => /\/pages\//.test(c.url)), false);
  assert.equal(calls.some((c) => c.body?.includes("secret-token")), false);
  assert.equal(calls.some((c) => c.body?.includes("90000001")), false);
  const failed = await recordOpc(summary, { OPC_NOTION_TOKEN: "secret-token", OPC_NOTION_PAGE_ID: "page-1" }, async () => { throw new Error("down"); });
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") assert.equal(failed.error.includes("secret-token"), false);
});

test("提交用的 token 由正式號與指紋決定，重試不變", () => {
  const row = preview([ready()]).rows[0];
  assert.equal(serviceToken(bundleKeyOf(row.formalNo, row.fingerprint), "deposit"), serviceToken(row.bundleKey, "deposit"));
  const again = previewSource(row.source, { catalog, deposit, drivers: [...EXCEL_DRIVERS], existing: [], backendChecked: true });
  assert.equal(again.bundleKey, row.bundleKey);
  assert.equal(again.notesDeposit.includes("備註甲-UNIQUE"), true);
});

function seed(token: string, type: "deposit" | "cremation", amount: number): PersistedService & { token: string } {
  return {
    token,
    companyOrderId: "00000000-0000-4000-8000-000000000099",
    linkedBookingId: "11111111-1111-4111-8111-000000000099",
    invoiceNo: 279,
    projectNo: "279",
    caseNo: type === "cremation" ? "279" : null,
    groupKey: "279",
    type,
    amount,
    paymentStatus: "pending",
    paymentIntent: "link",
    creditApplied: false,
    driverField: "Ricky",
    driverDetail: "Ricky",
    notes: "專案編號：279 | 備註甲-UNIQUE | 單據編號：279-DEPOSIT",
    draftNote: "單據編號：279-DEPOSIT",
    serviceDate: "2026-11-26",
    serviceTime: "10:30",
    productSkus: [],
    adoptedExisting: true,
    status: "new",
  };
}
