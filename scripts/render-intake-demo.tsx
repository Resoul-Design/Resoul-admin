import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EXCEL_DRIVERS } from "../lib/driver-names";
import { buildBundleIntent, createMemoryGateway, runIntakeBundle } from "../lib/order-bundle";
import { prepareIntake, type OfficialVariant } from "../lib/order-intake";
import { recordOpc } from "../lib/opc-log";
import { IntakeReview, ResultPanel } from "../app/(dashboard)/new-order/intake/review-view";

const catalog: OfficialVariant[] = [
  { id: "gid://shopify/ProductVariant/1", sku: "RS-DEPOSIT", title: "標準", productTitle: "預約接送訂金", productType: "deposit", price: 1800 },
  { id: "gid://shopify/ProductVariant/2", sku: "SJ30", title: "30-40kg", productTitle: "星之旅", productType: "cremation", price: 4800 },
  { id: "gid://shopify/ProductVariant/3", sku: "URN06", title: "標準", productTitle: "骨灰龕", productType: "product", price: 900 },
];
const header = "單號,訂單狀態,主人姓名,聯絡電話,寵物名稱,動物類型,品種,重量（公斤）,到達日期,到達時間,接送地點,司機,套餐,套餐代碼,套餐價格,火化／訂單日期,火化時間,告別日期,骨灰龕,骨灰龕取回日期,備註,已收訂金,司機費用結算日,日期代碼,客人下單日期";
const cells = (row: Record<string, string>) => header.split(",").map((k) => row[k] || "").join(",");
const base = {
  訂單狀態: "Appointment Made", 動物類型: "貓", 品種: "唐貓", "重量（公斤）": "32", 到達日期: "2026-11-26", 到達時間: "10:30",
  套餐: "星之旅", 套餐代碼: "SJ30", 套餐價格: "4800", "火化／訂單日期": "2026-11-27", 火化時間: "11:00", 告別日期: "2026-11-26", 骨灰龕: "By Package", 骨灰龕取回日期: "2026-11-27",
};
const csv = [
  header,
  cells({ ...base, 單號: "278", 主人姓名: "合成舊檔", 聯絡電話: "91000001", 寵物名稱: "合成舊寵物", 接送地點: "合成地址舊", 司機: "Ricky", 備註: "舊於 278" }),
  cells({ ...base, 單號: "279", 主人姓名: "合成主人甲", 聯絡電話: "91000002", 寵物名稱: "合成寵物甲", 接送地點: "合成地址甲", 司機: "Ricky", 備註: "甲的備註-UNIQUE" }),
  cells({ ...base, 單號: "280", 主人姓名: "合成主人乙", 聯絡電話: "91000003", 寵物名稱: "合成寵物乙", 接送地點: "合成地址乙", 司機: "Joe", 套餐: "TBC", 套餐代碼: "", 套餐價格: "", 備註: "乙只開押金" }),
  cells({ ...base, 單號: "281", 主人姓名: "合成主人丙", 聯絡電話: "91000004", 寵物名稱: "合成寵物丙", 接送地點: "合成地址丙", 司機: "", 備註: "同上" }),
].join("\n");

const preview = prepareIntake({
  logisticsCsv: csv,
  source: { fileName: "synthetic-customers.csv", location: "合成：不連接正式試算表", fetchedAtHk: "2026-11-25T18:00:00+08:00" },
  catalog,
  deposit: { catalog: { amount: 1800, variantId: catalog[0].id, sku: "RS-DEPOSIT" }, envAmount: null, establishedDefault: null },
  drivers: [...EXCEL_DRIVERS],
  driversLive: false,
  existing: [],
  backendChecked: true,
  now: new Date("2026-11-25T10:00:00Z"),
  backendOnlyNumbers: [350],
});

async function main() {
const row = preview.rows.find((r) => r.formalNo === 279);
if (!row) throw new Error("缺少合成 279");
const built = buildBundleIntent(row, {}, [...EXCEL_DRIVERS]);
if (!built.ok) throw new Error("合成 279 未能組成提交");
const aligned = await runIntakeBundle(built.intent, createMemoryGateway({ allocate: () => ({ invoiceNo: 279, projectNo: "279" }) }));
const mismatched = await runIntakeBundle(built.intent, createMemoryGateway({ allocate: () => ({ invoiceNo: 351, projectNo: "351" }) }));
const opc = await recordOpc({
  atHk: preview.source.previewedAtHk,
  formalNo: 279,
  business: aligned.business === "verified" ? "verified" : "mismatch",
  serviceCount: aligned.services.length,
  amounts: aligned.services.map((s) => ({ type: s.type, amount: s.amount })),
  payment: "pending",
  driverIndependent: !!aligned.verify?.driverIndependent,
  formalAligned: !!aligned.verify?.formalAligned,
  elapsedMs: aligned.elapsedMs,
}, {});

const body = renderToStaticMarkup(createElement("div", { style: { maxWidth: 880, margin: "0 auto", padding: 24 } },
  createElement("h1", { style: { fontFamily: "serif" } }, "試算表預檢開單（合成資料）"),
  createElement("p", null, "這頁由正式預檢與記憶體開單閘道產生，沒有連接正式資料庫、Shopify 或 Notion。"),
  createElement(IntakeReview, { preview }),
  createElement("h2", null, "保存後讀回：編號與來源一致"),
  createElement(ResultPanel, { business: aligned, opc, elapsedMs: aligned.elapsedMs }),
  createElement("h2", null, "保存後讀回：系統單號與正式號不同"),
  createElement(ResultPanel, { business: mismatched, opc, elapsedMs: mismatched.elapsedMs }),
));

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>試算表預檢開單示範</title></head><body style="margin:0;background:#faf6ef;color:#3b2f27;font-family:'Noto Sans TC',sans-serif">${body}</body></html>`;
const out = process.argv[2] || "/tmp/resoul-intake-demo.html";
writeFileSync(out, html);
console.log(out);
}

main();
