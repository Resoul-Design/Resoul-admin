// 開單前預檢：沿用客戶資料 CSV 匯入（lib/logistics-import）讀「Customers Record & Logistic」，
// 一次驗證、查重、對照官方 SKU 價錢，並為每一行產生互相隔離、可覆核的開單內容。
// 不寫資料庫、不呼叫外部服務、不抄上一張單的備註，也不發明來源沒有的資料。
import { createHash } from "node:crypto";
import { canonicalDriver } from "@/lib/driver-names";
import { EXCEL_FIELD_LABELS, LEGACY_FIELD_LABELS, LOGISTICS_FIELDS } from "@/lib/logistics-fields";
import { parseCsv, planImport, toDate } from "@/lib/logistics-import";
import { isMemorialTracking, planMemorialImport } from "@/lib/memorial-import";
import { phoneKey } from "@/lib/product-orders";

export const FORMAL_MIN_EXCLUSIVE = 278;
export const SOURCE_ZONE = "Asia/Hong_Kong" as const;

export type OfficialVariant = {
  id: string;
  sku: string;
  title: string;
  productTitle: string;
  productType: "cremation" | "deposit" | "product";
  price: number;
};

export type ExistingIdentity = {
  formalNo: number;
  projectNo: string;
  invoiceNo: number | null;
  owner: string;
  pet: string;
  phone: string;
  weightKg: number | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  canceled: boolean;
  hasDeposit: boolean;
  hasCremation: boolean;
};

export type ProductSource = { code: string; name: string; qty: number; priceRaw: string };

/** 單一來源行。只含這一格的原文，不會帶入其他客人。 */
export type SourceValues = {
  line: number;
  formalNo: number;
  status: string;
  owner: string;
  phone: string;
  email: string;
  pet: string;
  animal: string;
  breed: string;
  weightRaw: string;
  arrivalDate: string;
  arrivalTime: string;
  address: string;
  driver: string;
  packageName: string;
  packageCode: string;
  packagePriceRaw: string;
  ceremonyDate: string;
  ceremonyTime: string;
  showerDate: string;
  urn: string;
  urnPickup: string;
  remark: string;
  depositReceivedRaw: string;
  driverSettledOn: string;
  dateCode: string;
  customerOrderDate: string;
  products: ProductSource[];
};

export type IntakeQuestion = { code: string; text: string; blocking: boolean };

export type IntakePayload = {
  formalNo: number;
  sourceLine: number;
  fingerprint: string;
  bundleKey: string;
  dedup: "unique" | "duplicate_kept" | "conflict" | "cross";
  mode: "new" | "reuse" | "blocked";
  existingProjectNo: string | null;
  hasExistingDeposit: boolean;
  hasExistingCremation: boolean;
  customer: { name: string; phone: string; email: string };
  pet: { name: string; type: string; breed: string; weightKg: number | null; weightApproximate: boolean };
  pickup: { date: string | null; time: string | null; address: string; driver: string | null };
  cremation: { date: string | null; time: string | null; zone: typeof SOURCE_ZONE } | null;
  /** 告別日期只作備註來源，不是第二個可編輯火化時間。 */
  farewellDate: string | null;
  package: {
    confirmed: boolean;
    name: string;
    sku: string | null;
    variantId: string | null;
    officialPrice: number | null;
    quotedPrice: number | null;
    reason: string;
  };
  products: { sku: string; title: string; variantId: string; qty: number; officialPrice: number }[];
  deposit: { amount: number | null; source: string | null; variantId: string | null; sku: string | null };
  notesDeposit: string;
  notesCremation: string;
  payment: { intent: "link"; status: "pending" };
  pendingFields: string[];
  backed: { rowStatus?: string; dateCode?: string; customerOrderDate?: string };
  withheldSuggestions: string[];
  questions: IntakeQuestion[];
  submittable: boolean;
  source: SourceValues;
};

export type IntakePreview = {
  source: { fileName: string; location: string; fetchedAtHk: string; previewedAtHk: string; zone: typeof SOURCE_ZONE };
  excluded: { line: number; formalNo: number | null; reason: string }[];
  rows: IntakePayload[];
  importErrors: string[];
  backendChecked: boolean;
  driversLive: boolean;
};

export type IntakeAnswers = {
  driver?: string;
  breed?: string;
  address?: string;
  note?: string;
  urnPickup?: "today" | "later" | "na";
};

export type DepositQuote = {
  catalog: { amount: number; variantId: string; sku: string } | null;
  envAmount: number | null;
  /** 只在目錄與環境變數都沒有時，標明既定設定的來源；不可當成已核對的官方價。 */
  establishedDefault: { amount: number; source: string } | null;
};

type Ctx = {
  catalog: OfficialVariant[];
  deposit: DepositQuote;
  drivers: string[];
  existing: ExistingIdentity[];
  backendChecked: boolean;
  now?: Date;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s（）()：:]/g, "");
const INVOICE_HEADERS = ["invoice_no", "單號", "發票編號", "order no.", "order no", "invoice no", "invoice no."].map(norm);

const HEADER_KEY = new Map<string, string>();
for (const f of LOGISTICS_FIELDS) {
  HEADER_KEY.set(norm(f.key), f.key);
  HEADER_KEY.set(norm(f.label), f.key);
}
for (const [label, key] of Object.entries({ ...LEGACY_FIELD_LABELS, ...EXCEL_FIELD_LABELS })) HEADER_KEY.set(norm(label), key);

export function hkTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SOURCE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00`;
}

export function bundleKeyOf(formalNo: number, fingerprint: string): string {
  return createHash("sha256").update(`intake|${formalNo}|${fingerprint}`).digest("hex").slice(0, 32);
}

/** 可重試的固定 client token。同一來源行＋服務種類永遠相同，重試不會另開一張。 */
export function serviceToken(bundleKey: string, type: "deposit" | "cremation"): string {
  const h = createHash("sha256").update(`${bundleKey}|${type}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function isMarker(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^["“”〃'`]+$/.test(s)) return true;
  return /^(同上|同上。|ditto|same(\s+as\s+above)?|tbc|tbd|n\/?a|#n\/a|#na|na|待定|待確認|未確認|預算|預算價|budget)$/i.test(s);
}

function canceledStatus(raw: string): boolean {
  return /cancel|取消|void|作廢/i.test(raw.trim());
}

function testStatus(raw: string): boolean {
  return /\btest\b|測試/i.test(raw.trim());
}

function nameKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "");
}

export function interpretWeight(raw: string): { kg: number | null; approximate: boolean } {
  const s = raw.trim();
  if (!s || isMarker(s)) return { kg: null, approximate: false };
  const range = /\d+(?:\.\d+)?\s*[-–到至]\s*\d/.test(s);
  const approximate = range || /約|大約|approx|~\s*\d|\d(?:\.\d+)?\s*(?:kg|公斤)?\s*\?/i.test(s);
  if (range) return { kg: null, approximate: true };
  const m = s.replace(/約|大約|approx\.?|~|公斤|kg|\?/gi, " ").match(/(\d+(?:\.\d+)?)/);
  if (!m || !Number.isFinite(Number(m[1]))) return { kg: null, approximate };
  return { kg: Math.round(Number(m[1]) * 1000) / 1000, approximate };
}

function quotedNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s || isMarker(s)) return null;
  const n = Number(s.replace(/[$,\sHKDhk]/gi, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function weightBand(title: string): { min: number; max: number } | null {
  const t = title.toLowerCase().replace(/公斤/g, "kg").replace(/\s/g, "");
  let m = t.match(/(\d+(?:\.\d+)?)[-–~到至](\d+(?:\.\d+)?)kg/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = t.match(/(\d+(?:\.\d+)?)kg/);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  return null;
}

function planNameMatches(variant: OfficialVariant, packageName: string): boolean {
  const name = packageName.trim().toLowerCase();
  if (!name || isMarker(packageName)) return false;
  const title = `${variant.productTitle} ${variant.title}`.toLowerCase();
  if (title.includes(name)) return true;
  const aliases: [RegExp, RegExp][] = [
    [/breeze|風之旅|^風$/, /風之旅|breeze/i],
    [/cloud|雲之旅|^雲$/, /雲之旅|cloud/i],
    [/star|星之旅|^星$/, /星之旅|star/i],
  ];
  return aliases.some(([src, prod]) => src.test(name) && prod.test(title));
}

function resolveDeposit(quote: DepositQuote): IntakePayload["deposit"] & { conflict: string } {
  const catalog = quote.catalog;
  const env = quote.envAmount;
  if (catalog && env != null && Math.abs(catalog.amount - env) > 0.009) {
    return { amount: null, source: null, variantId: null, sku: null, conflict: `官方訂金 ${catalog.sku} 為 ${catalog.amount}，DEPOSIT_AMOUNT 為 ${env}，兩者不一致，不會代為挑選。` };
  }
  if (catalog) return { amount: catalog.amount, source: `官方 SKU ${catalog.sku}`, variantId: catalog.variantId, sku: catalog.sku, conflict: "" };
  if (env != null) return { amount: null, source: null, variantId: null, sku: null, conflict: `已讀到 DEPOSIT_AMOUNT＝${env}，但沒有官方訂金 SKU，不能當作已核對價錢。` };
  if (quote.establishedDefault) {
    return { amount: null, source: null, variantId: null, sku: null, conflict: `未有官方訂金 SKU，亦未設定 DEPOSIT_AMOUNT。程式既定值 ${quote.establishedDefault.amount}（${quote.establishedDefault.source}）只供參考，不會當成已確認金額。` };
  }
  return { amount: null, source: null, variantId: null, sku: null, conflict: "未有官方訂金價，不能確認接送押金金額。" };
}

function matchPackage(values: SourceValues, weight: { kg: number | null; approximate: boolean }, catalog: OfficialVariant[]): IntakePayload["package"] {
  const cremation = catalog.filter((v) => v.productType === "cremation");
  const codeRaw = values.packageCode.trim();
  const nameRaw = values.packageName.trim();
  if (isMarker(codeRaw) || isMarker(nameRaw)) {
    return { confirmed: false, name: "", sku: null, variantId: null, officialPrice: null, quotedPrice: null, reason: "套餐欄是同上、TBC、#N/A 或預算等未確認記號，沒有抄用上一行。" };
  }
  const quoted = quotedNumber(values.packagePriceRaw);
  if (isMarker(values.packagePriceRaw)) {
    return { confirmed: false, name: nameRaw, sku: null, variantId: null, officialPrice: null, quotedPrice: null, reason: "套餐價格是未確認記號，空白或未核對都不等於已確認 0。" };
  }
  let variant = codeRaw ? cremation.find((v) => v.sku.toUpperCase() === codeRaw.toUpperCase()) || null : null;
  if (codeRaw && !variant) {
    return { confirmed: false, name: nameRaw, sku: codeRaw, variantId: null, officialPrice: null, quotedPrice: quoted, reason: `官方目錄沒有套餐 SKU ${codeRaw}。` };
  }
  if (!variant && nameRaw) {
    const hits = cremation.filter((v) => planNameMatches(v, nameRaw));
    const bandHits = weight.kg != null ? hits.filter((v) => { const b = weightBand(v.title); return b ? weight.kg! >= b.min && weight.kg! <= b.max : false; }) : [];
    if (bandHits.length === 1) variant = bandHits[0];
    else if (hits.length === 1 && !weightBand(hits[0].title)) variant = hits[0];
    else if (!hits.length) return { confirmed: false, name: nameRaw, sku: null, variantId: null, officialPrice: null, quotedPrice: quoted, reason: "套餐名稱對不上官方款式。" };
    else return { confirmed: false, name: nameRaw, sku: null, variantId: null, officialPrice: null, quotedPrice: quoted, reason: "同一套餐有多於一個重量款式，來源沒有可核對的 SKU。" };
  }
  if (!variant) return { confirmed: false, name: "", sku: null, variantId: null, officialPrice: null, quotedPrice: quoted, reason: "來源沒有已確認套餐。" };
  if (weight.approximate || weight.kg == null) {
    return { confirmed: false, name: variant.productTitle, sku: variant.sku, variantId: null, officialPrice: variant.price, quotedPrice: quoted, reason: "重量是大約數或未能讀取，套餐維持待確認，不會把大約重量當成實際重量。" };
  }
  const band = weightBand(variant.title);
  if (band && (weight.kg < band.min || weight.kg > band.max)) {
    return { confirmed: false, name: variant.productTitle, sku: variant.sku, variantId: null, officialPrice: variant.price, quotedPrice: quoted, reason: `重量 ${weight.kg} 公斤不在款式「${variant.title}」區間。` };
  }
  if (quoted != null && Math.abs(quoted - variant.price) > 0.009) {
    return { confirmed: false, name: variant.productTitle, sku: variant.sku, variantId: null, officialPrice: variant.price, quotedPrice: quoted, reason: `來源價格 ${quoted} 與官方價 ${variant.price} 不同，不會改價，亦不會當成已確認。` };
  }
  const priceNote = quoted == null ? "來源價格空白，將按官方價，不是已確認 0。" : "";
  return { confirmed: true, name: variant.productTitle, sku: variant.sku, variantId: variant.id, officialPrice: variant.price, quotedPrice: quoted, reason: priceNote };
}

function confirmProducts(values: SourceValues, catalog: OfficialVariant[]): { lines: IntakePayload["products"]; questions: IntakeQuestion[] } {
  const lines: IntakePayload["products"] = [];
  const questions: IntakeQuestion[] = [];
  const products = catalog.filter((v) => v.productType === "product");
  values.products.forEach((p, index) => {
    const label = p.code || p.name || `第 ${index + 1} 項`;
    if (isMarker(p.code) || isMarker(p.name) || isMarker(p.priceRaw)) {
      questions.push({ code: "product_unconfirmed", blocking: false, text: `產品「${label}」是同上、TBC 或未確認記號，沒有抄用其他行，亦不會建立。` });
      return;
    }
    if (!p.code) {
      questions.push({ code: "product_unconfirmed", blocking: false, text: `產品「${p.name || label}」沒有 SKU，不會猜測代碼。` });
      return;
    }
    const variant = products.find((v) => v.sku.toUpperCase() === p.code.toUpperCase());
    const quoted = quotedNumber(p.priceRaw);
    const urnish = /^urn/i.test(p.code) || /骨灰|urn/i.test(p.name);
    const packaged = /by\s*package|套餐包括|套餐已包|included/i.test(values.urn) || /by\s*package|included|套餐包括/i.test(p.name);
    if (urnish && packaged && (quoted == null || quoted === 0)) return;
    if (urnish && quoted === 0 && variant && variant.price === 0) return;
    if (!variant) {
      questions.push({ code: "product_unconfirmed", blocking: false, text: `產品 SKU ${p.code} 不在官方目錄，不會建立。` });
      return;
    }
    if (quoted === 0 && variant.price > 0) {
      questions.push({ code: "product_unconfirmed", blocking: false, text: `${p.code} 來源價為 0，官方價為 ${variant.price}。空值或 0 不是已確認免費，不會當成加購。` });
      return;
    }
    if (quoted != null && Math.abs(quoted - variant.price) > 0.009) {
      questions.push({ code: "product_unconfirmed", blocking: false, text: `${p.code} 來源價 ${quoted} 與官方價 ${variant.price} 不同，不會改價，亦不會建立。` });
      return;
    }
    lines.push({ sku: variant.sku, title: variant.productTitle, variantId: variant.id, qty: p.qty > 0 ? p.qty : 1, officialPrice: variant.price });
  });
  return { lines, questions };
}

function fingerprintOf(owner: string, pet: string, phone: string, weight: { kg: number | null; approximate: boolean }, arrivalDate: string, arrivalTime: string, weightRaw: string): string {
  const weightToken = weight.kg == null ? `raw:${weightRaw.trim().toLowerCase()}` : `${weight.approximate ? "approx" : "exact"}:${weight.kg}`;
  return [nameKey(owner), nameKey(pet), phoneKey(phone), weightToken, arrivalDate, arrivalTime].join("|");
}

function backedText(raw: string): string | null {
  const s = raw.trim();
  if (!s || isMarker(s) || /^#/.test(s)) return null;
  return s.slice(0, 80);
}

function farewellNote(ceremonyDate: string, showerDate: string): { farewellDate: string | null; note: string } {
  if (!showerDate || showerDate === ceremonyDate) return { farewellDate: null, note: "" };
  if (!ceremonyDate) return { farewellDate: showerDate, note: "" };
  return { farewellDate: showerDate, note: `告別日期（來源，不是火化開始）：${showerDate}。火化欄只記入火化開始。` };
}

function buildNotes(kind: "deposit" | "cremation", remark: string, remarkUnconfirmed: boolean, farewell: string, approximate: boolean): string {
  const parts: string[] = [];
  if (remark && !remarkUnconfirmed) parts.push(remark.trim());
  if (kind === "cremation" && farewell) parts.push(farewell);
  if (approximate) parts.push("重量為大約數，實際重量待核實。");
  return parts.join("\n").slice(0, 1000);
}

function assess(values: SourceValues, ctx: Ctx): IntakePayload {
  const weight = interpretWeight(values.weightRaw);
  const arrivalDate = values.arrivalDate && !isMarker(values.arrivalDate) ? values.arrivalDate : "";
  const arrivalTime = values.arrivalTime && !isMarker(values.arrivalTime) ? values.arrivalTime : "";
  const ceremonyDate = values.ceremonyDate && !isMarker(values.ceremonyDate) ? values.ceremonyDate : "";
  const ceremonyTime = values.ceremonyTime && !isMarker(values.ceremonyTime) ? values.ceremonyTime : "";
  const showerDate = values.showerDate && !isMarker(values.showerDate) ? values.showerDate : "";
  const farewell = farewellNote(ceremonyDate, showerDate);
  const remarkUnconfirmed = isMarker(values.remark);
  const fp = fingerprintOf(values.owner, values.pet, values.phone, weight, arrivalDate, arrivalTime, values.weightRaw);
  const pack = matchPackage(values, weight, ctx.catalog);
  const productResult = confirmProducts(values, ctx.catalog);
  const deposit = resolveDeposit(ctx.deposit);
  const driverName = canonicalDriver(values.driver);
  const driverKnown = !!driverName && !isMarker(values.driver) && ctx.drivers.some((d) => canonicalDriver(d) === driverName);
  const questions: IntakeQuestion[] = [...productResult.questions];
  const push = (q: IntakeQuestion) => { if (!questions.some((x) => x.code === q.code && x.text === q.text)) questions.push(q); };

  if (!ctx.backendChecked) push({ code: "backend_not_checked", blocking: true, text: "未能讀取後台做正式號及指紋查重，不會開單。" });
  if (!values.owner.trim()) push({ code: "missing_owner", blocking: true, text: "缺少主人姓名。" });
  if (phoneKey(values.phone).length !== 8) push({ code: "missing_phone", blocking: true, text: "缺少有效電話（需可辨認的 8 位號碼）。" });
  if (!values.pet.trim()) push({ code: "missing_pet", blocking: true, text: "缺少寵物名稱。" });
  if (!values.breed.trim() || isMarker(values.breed)) push({ code: "missing_breed", blocking: true, text: "缺少品種。不會填寫猜測品種。" });
  if (weight.kg == null || weight.kg <= 0) push({ code: "missing_weight", blocking: true, text: weight.approximate ? "重量是範圍或大約數且沒有單一公斤數，不能開單。" : "缺少可讀的重量（公斤）。" });
  if (weight.approximate && weight.kg != null) push({ code: "weight_approximate", blocking: false, text: "重量標為大約數，實際重量待核實；套餐因此未確認。" });
  if (!arrivalDate) push({ code: "missing_arrival_date", blocking: true, text: "缺少到達日期。不會編造檔期。" });
  if (!arrivalTime) push({ code: "missing_arrival_time", blocking: true, text: "缺少到達時間。不會編造鐘點。" });
  if (!values.address.trim() || isMarker(values.address)) push({ code: "missing_address", blocking: true, text: "缺少接送地址。" });
  if (!values.driver.trim() || isMarker(values.driver)) push({ code: "missing_driver", blocking: true, text: "缺少司機。必須記入獨立司機欄，不會由其他欄推斷，亦不會寫進備註代替。" });
  else if (!driverKnown) push({ code: "driver_unknown", blocking: true, text: `司機「${values.driver.trim()}」不在已設定的司機名單，不會改寫成其他司機。` });
  if (!pack.confirmed) push({ code: "package_unconfirmed", blocking: false, text: `套餐未確認：${pack.reason}此行只會準備接送押金，火化維持待確認。` });
  if (pack.confirmed && !ceremonyDate) push({ code: "missing_cremation_date", blocking: true, text: "套餐已確認但沒有火化開始日期。不會把告別日期填入火化欄。" });
  if (pack.confirmed && !ceremonyTime) push({ code: "missing_cremation_time", blocking: true, text: "套餐已確認但沒有火化開始時間。" });
  if (!ceremonyDate && farewell.farewellDate) push({ code: "farewell_without_cremation", blocking: false, text: "來源只有告別日期，沒有火化開始。不會發明第二個時間欄，亦不會把告別日期寫進火化欄。" });
  if (deposit.conflict) push({ code: "deposit_price_unconfirmed", blocking: true, text: deposit.conflict });
  if (remarkUnconfirmed) push({ code: "note_ditto", blocking: true, text: "備註是同上或未確認記號。沒有抄上一張單，請只填這一張單的備註，或明確留空。" });
  const depositReceived = quotedNumber(values.depositReceivedRaw);
  if (depositReceived != null && depositReceived > 0) push({ code: "payment_not_evidence", blocking: false, text: "來源寫了已收金額，但沒有付款方式或收據。只會保持待付款／稍後付款，不會標記已付，也不會把未收押金拿去抵扣。" });
  if (values.driverSettledOn && !isMarker(values.driverSettledOn)) push({ code: "driver_settlement_not_payment", blocking: false, text: "司機結算日不是顧客付款，不會因此標成已付。" });

  const pendingFields: string[] = [];
  if (!pack.confirmed) pendingFields.push("套餐／火化（未確認，不會建立）");
  if (weight.approximate) pendingFields.push("實際重量");
  if (!ceremonyDate) pendingFields.push("火化開始日期");
  if (!ceremonyTime) pendingFields.push("火化開始時間");
  if (farewell.farewellDate && !ceremonyDate) pendingFields.push("告別日期只見於來源，未有對應火化開始");
  for (const q of productResult.questions) pendingFields.push(q.text);

  const backed: IntakePayload["backed"] = {};
  const withheld: string[] = [];
  const status = backedText(values.status);
  const dateCode = backedText(values.dateCode);
  const orderDate = backedText(values.customerOrderDate);
  if (status && !canceledStatus(status) && !testStatus(status)) backed.rowStatus = status;
  else withheld.push("訂單狀態");
  if (dateCode) backed.dateCode = dateCode;
  else withheld.push("日期代碼");
  if (orderDate && toDate(orderDate)) backed.customerOrderDate = toDate(orderDate) || orderDate;
  else withheld.push("客人下單日期");

  const payload: IntakePayload = {
    formalNo: values.formalNo,
    sourceLine: values.line,
    fingerprint: fp,
    bundleKey: bundleKeyOf(values.formalNo, fp),
    dedup: "unique",
    mode: "new",
    existingProjectNo: null,
    hasExistingDeposit: false,
    hasExistingCremation: false,
    customer: { name: values.owner.trim(), phone: values.phone.trim(), email: values.email.trim() },
    pet: { name: values.pet.trim(), type: values.animal.trim(), breed: values.breed.trim(), weightKg: weight.kg, weightApproximate: weight.approximate },
    pickup: { date: arrivalDate || null, time: arrivalTime || null, address: values.address.trim(), driver: driverKnown ? driverName : null },
    cremation: ceremonyDate || ceremonyTime ? { date: ceremonyDate || null, time: ceremonyTime || null, zone: SOURCE_ZONE } : null,
    farewellDate: farewell.farewellDate,
    package: pack,
    products: pack.confirmed ? productResult.lines : [],
    deposit: { amount: deposit.amount, source: deposit.source, variantId: deposit.variantId, sku: deposit.sku },
    notesDeposit: buildNotes("deposit", values.remark, remarkUnconfirmed, farewell.note, weight.approximate),
    notesCremation: buildNotes("cremation", values.remark, remarkUnconfirmed, farewell.note, weight.approximate),
    payment: { intent: "link", status: "pending" },
    pendingFields,
    backed,
    withheldSuggestions: withheld,
    questions,
    submittable: false,
    source: values,
  };
  return { ...payload, submittable: payload.mode !== "blocked" && !payload.questions.some((q) => q.blocking) };
}

function applyExisting(row: IntakePayload, ctx: Ctx): IntakePayload {
  if (row.mode === "blocked" || row.dedup === "conflict" || row.dedup === "cross") {
    return { ...row, submittable: false };
  }
  const questions = [...row.questions];
  const sameFormal = ctx.existing.filter((e) => e.formalNo === row.formalNo || e.invoiceNo === row.formalNo || e.projectNo === String(row.formalNo));
  const samePrint = (e: ExistingIdentity) => fingerprintOf(e.owner, e.pet, e.phone, { kg: e.weightKg, approximate: false }, e.arrivalDate || "", e.arrivalTime || "", e.weightKg == null ? "" : String(e.weightKg)) === row.fingerprint
    || (nameKey(e.owner) === nameKey(row.customer.name) && nameKey(e.pet) === nameKey(row.pet.name) && phoneKey(e.phone) === phoneKey(row.customer.phone) && e.weightKg != null && row.pet.weightKg != null && !row.pet.weightApproximate && e.weightKg === row.pet.weightKg && (e.arrivalDate || "") === (row.pickup.date || "") && (e.arrivalTime || "") === (row.pickup.time || ""));
  let mode: IntakePayload["mode"] = row.mode;
  let dedup: IntakePayload["dedup"] = row.dedup;
  let project: string | null = null;
  let hasDeposit = false;
  let hasCremation = false;
  if (sameFormal.some((e) => e.canceled)) {
    mode = "blocked";
    dedup = "conflict";
    questions.push({ code: "existing_canceled", blocking: true, text: `正式號 ${row.formalNo} 在後台已取消，不會重開，亦不會改舊單。` });
  } else if (sameFormal.length && sameFormal.every(samePrint)) {
    mode = "reuse";
    project = sameFormal[0].projectNo;
    hasDeposit = sameFormal.some((e) => e.hasDeposit);
    hasCremation = sameFormal.some((e) => e.hasCremation);
  } else if (sameFormal.length) {
    mode = "blocked";
    dedup = "conflict";
    questions.push({ code: "existing_fingerprint_conflict", blocking: true, text: `正式號 ${row.formalNo} 已有專案，但主人、寵物、電話或重量／到達指紋不同。只憑寵物名不會當成同一筆，亦不會覆蓋舊單。` });
  }
  const cross = ctx.existing.filter((e) => !e.canceled && e.formalNo !== row.formalNo && e.projectNo !== String(row.formalNo) && samePrint(e));
  if (cross.length) {
    mode = "blocked";
    dedup = "cross";
    questions.push({ code: "possible_cross_number_duplicate", blocking: true, text: `與後台正式號 ${cross[0].formalNo} 的主人、寵物、電話及重量／到達指紋相同，但正式號不同。不會另開新專案。` });
  }
  return { ...row, mode, dedup, existingProjectNo: project, hasExistingDeposit: hasDeposit, hasExistingCremation: hasCremation, questions, submittable: mode !== "blocked" && !questions.some((q) => q.blocking) };
}

/** 只填來源留空的欄。不會改寫來源已有的值，也不會讀取其他行。 */
export function reviewRow(row: IntakePayload, answers: IntakeAnswers, drivers: string[]): IntakePayload {
  const source: SourceValues = {
    ...row.source,
    products: row.source.products.map((p) => ({ ...p })),
  };
  if ((!source.driver.trim() || isMarker(source.driver)) && answers.driver?.trim()) source.driver = answers.driver.trim();
  if ((!source.breed.trim() || isMarker(source.breed)) && answers.breed?.trim()) source.breed = answers.breed.trim();
  if ((!source.address.trim() || isMarker(source.address)) && answers.address?.trim()) source.address = answers.address.trim();
  if (isMarker(source.remark)) {
    if (answers.note === "") source.remark = "";
    else if (answers.note?.trim()) source.remark = answers.note.trim();
  }
  const ctx: Ctx = {
    catalog: [],
    deposit: { catalog: row.deposit.variantId && row.deposit.amount != null && row.deposit.sku ? { amount: row.deposit.amount, variantId: row.deposit.variantId, sku: row.deposit.sku } : null, envAmount: null, establishedDefault: null },
    drivers,
    existing: [],
    backendChecked: true,
  };
  // 價錢與套餐是否確認沿用這一行已對過官方目錄的結果，避免覆核時改用空白目錄把已確認套餐抹掉。
  const next = assess(source, { ...ctx, catalog: catalogFromPayload(row), deposit: depositQuoteFromPayload(row) });
  const kept = row.questions.filter((q) => q.code === "backend_not_checked" || q.code === "existing_canceled" || q.code === "existing_fingerprint_conflict" || q.code === "possible_cross_number_duplicate");
  let questions = [...next.questions.filter((q) => q.code !== "backend_not_checked"), ...kept];
  if (row.package.confirmed && !urnResolved(source) && answers.urnPickup !== "today" && answers.urnPickup !== "later" && answers.urnPickup !== "na") {
    questions.push({ code: "urn_arrangement_unknown", blocking: true, text: "套餐已確認，但骨灰取回安排未能由來源判斷。請選今日取回、另日取回或不適用；不會猜測。" });
  }
  questions = questions.filter((q, i) => questions.findIndex((x) => x.code === q.code && x.text === q.text) === i);
  const mode = row.mode === "blocked" ? "blocked" : row.mode;
  return {
    ...next,
    dedup: row.dedup,
    mode,
    existingProjectNo: row.existingProjectNo,
    hasExistingDeposit: row.hasExistingDeposit,
    hasExistingCremation: row.hasExistingCremation,
    package: row.package,
    products: row.package.confirmed ? next.products.length ? next.products : row.products : [],
    deposit: row.deposit.amount != null ? row.deposit : next.deposit,
    questions,
    submittable: mode !== "blocked" && row.dedup !== "conflict" && row.dedup !== "cross" && !questions.some((q) => q.blocking),
  };
}

function urnResolved(values: SourceValues): boolean {
  if (/no\s*urn|不需要/i.test(values.urn)) return true;
  if (values.urnPickup && (/^\d{4}-\d{2}-\d{2}$/.test(values.urnPickup) || values.urnPickup === "待定")) return true;
  return false;
}

function catalogFromPayload(row: IntakePayload): OfficialVariant[] {
  const out: OfficialVariant[] = [];
  if (row.package.confirmed && row.package.variantId && row.package.sku && row.package.officialPrice != null) {
    out.push({ id: row.package.variantId, sku: row.package.sku, title: "已對照", productTitle: row.package.name, productType: "cremation", price: row.package.officialPrice });
  }
  for (const p of row.products) out.push({ id: p.variantId, sku: p.sku, title: "已對照", productTitle: p.title, productType: "product", price: p.officialPrice });
  if (row.deposit.variantId && row.deposit.sku && row.deposit.amount != null) out.push({ id: row.deposit.variantId, sku: row.deposit.sku, title: "訂金", productTitle: "預約接送訂金", productType: "deposit", price: row.deposit.amount });
  return out;
}

function depositQuoteFromPayload(row: IntakePayload): DepositQuote {
  if (row.deposit.variantId && row.deposit.sku && row.deposit.amount != null) {
    return { catalog: { amount: row.deposit.amount, variantId: row.deposit.variantId, sku: row.deposit.sku }, envAmount: null, establishedDefault: null };
  }
  return { catalog: null, envAmount: null, establishedDefault: null };
}

function rawTable(text: string): { line: number; formalRaw: string; cells: Record<string, string> }[] {
  const table = parseCsv(text);
  if (!table.length) return [];
  const headers = table[0];
  const invoiceCol = headers.findIndex((h) => INVOICE_HEADERS.includes(norm(h)));
  const keys = headers.map((h) => HEADER_KEY.get(norm(h)) || "");
  const out = [];
  for (let r = 1; r < table.length; r++) {
    const cells: Record<string, string> = {};
    keys.forEach((key, i) => { if (key) cells[key] = String(table[r][i] ?? "").trim(); });
    out.push({ line: r + 1, formalRaw: invoiceCol >= 0 ? String(table[r][invoiceCol] ?? "").trim() : "", cells });
  }
  return out;
}

function sourceFrom(raw: { line: number; cells: Record<string, string> }, formalNo: number, products: ProductSource[]): SourceValues {
  const c = raw.cells;
  const date = (key: string) => {
    const v = c[key] || "";
    if (!v || isMarker(v)) return "";
    return toDate(v) || v;
  };
  return {
    line: raw.line,
    formalNo,
    status: c.row_status || "",
    owner: c.owner_name || "",
    phone: c.phone || "",
    email: c.email || "",
    pet: c.pet_name || "",
    animal: c.animal || "",
    breed: c.breed || "",
    weightRaw: c.weight_kg || "",
    arrivalDate: date("arrival_date"),
    arrivalTime: c.arrival_time || "",
    address: c.pickup_from || "",
    driver: c.driver || "",
    packageName: c.package_name || "",
    packageCode: c.package_code || "",
    packagePriceRaw: c.package_price || "",
    ceremonyDate: date("ceremony_or_order_date"),
    ceremonyTime: c.ceremony_time || "",
    showerDate: date("shower_date"),
    urn: c.urn || "",
    urnPickup: c.urn_pickup_status || "",
    remark: c.memorial_remarks || "",
    depositReceivedRaw: c.deposit_received || "",
    driverSettledOn: c.driver_fee_settled_at || "",
    dateCode: c.date_code || "",
    customerOrderDate: c.customer_order_date || "",
    products,
  };
}

export function prepareIntake(input: {
  logisticsCsv: string;
  memorialCsv?: string;
  source: { fileName: string; location: string; fetchedAtHk: string };
  catalog: OfficialVariant[];
  deposit: DepositQuote;
  drivers: string[];
  existing: ExistingIdentity[];
  backendChecked: boolean;
  /** 只存在於後台、不是這份試算表的歷史自動編號。不會被加成新來源行。 */
  backendOnlyNumbers?: number[];
  driversLive?: boolean;
  now?: Date;
}): IntakePreview {
  const previewedAtHk = hkTimestamp(input.now);
  const base: IntakePreview = {
    source: { fileName: input.source.fileName.trim(), location: input.source.location.trim(), fetchedAtHk: input.source.fetchedAtHk.trim(), previewedAtHk, zone: SOURCE_ZONE },
    excluded: [] as IntakePreview["excluded"],
    rows: [] as IntakePayload[],
    importErrors: [] as string[],
    backendChecked: input.backendChecked,
    driversLive: input.driversLive !== false,
  };
  if (!base.source.fileName || !base.source.location || !base.source.fetchedAtHk) {
    base.importErrors.push("請註明檔案名稱、來源位置，以及香港時間的取得時間。不會用空白來源開單。");
    return base;
  }
  const planned = planImport(input.logisticsCsv, { isAdmin: true });
  base.importErrors.push(...planned.errors);
  if (planned.rows.length > 400) {
    base.importErrors.push("一次最多預檢 400 行正式號。");
    return base;
  }
  for (const extra of planned.extras) base.excluded.push({ line: extra.line, formalNo: extra.invoiceNo, reason: `附加參考 ${extra.ref} 不是新的正式編號，不會開成新單。` });
  const productsByNo = new Map<number, ProductSource[]>();
  if (input.memorialCsv?.trim()) {
    if (!isMemorialTracking(input.memorialCsv)) base.importErrors.push("第二份檔不是 Memorial Product Order Tracking，產品行沒有讀入。");
    else {
      const memorial = planMemorialImport(input.memorialCsv);
      base.importErrors.push(...memorial.errors);
      for (const row of memorial.rows) {
        if (row.extraRef) {
          base.excluded.push({ line: row.line, formalNo: row.invoiceNo, reason: `紀念品附加參考 ${row.extraRef} 不當作新單產品。` });
          continue;
        }
        const list = productsByNo.get(row.invoiceNo) || [];
        list.push({ code: row.values.product_code || "", name: row.values.product_name, qty: row.values.quantity || 1, priceRaw: row.values.unit_price == null ? "" : String(row.values.unit_price) });
        productsByNo.set(row.invoiceNo, list);
      }
    }
  }
  const raws = rawTable(input.logisticsCsv);
  const ctx: Ctx = { catalog: input.catalog, deposit: input.deposit, drivers: input.drivers, existing: input.existing, backendChecked: input.backendChecked, now: input.now };
  const assessed: IntakePayload[] = [];
  for (const raw of raws) {
    const clean = raw.formalRaw.replace(/^#/, "").replace(/[,\s]/g, "").replace(/\.0+$/, "");
    if (!clean) continue;
    if (!/^\d+$/.test(clean)) continue;
    const formalNo = Number(clean);
    if (formalNo <= FORMAL_MIN_EXCLUSIVE) {
      base.excluded.push({ line: raw.line, formalNo, reason: `正式號 ${formalNo} 不大於 ${FORMAL_MIN_EXCLUSIVE}，不當作新單。` });
      continue;
    }
    if (canceledStatus(raw.cells.row_status || "")) {
      base.excluded.push({ line: raw.line, formalNo, reason: "來源狀態為已取消，不會重建。" });
      continue;
    }
    if (testStatus(raw.cells.row_status || "")) {
      base.excluded.push({ line: raw.line, formalNo, reason: "來源標成測試。未另外指定開測試單，不會自動開成 TEST 單，也不會開成正式單。" });
      continue;
    }
    const values = sourceFrom(raw, formalNo, productsByNo.get(formalNo) || []);
    const normalized = planned.rows.find((r) => r.line === raw.line);
    if (normalized) {
      const time = (key: "arrival_time" | "ceremony_time") => (typeof normalized.values[key] === "string" ? String(normalized.values[key]) : "");
      if (time("arrival_time")) values.arrivalTime = time("arrival_time");
      if (time("ceremony_time")) values.ceremonyTime = time("ceremony_time");
      if (typeof normalized.values.weight_kg === "number" && !interpretWeight(values.weightRaw).approximate) values.weightRaw = String(normalized.values.weight_kg);
    }
    assessed.push(assess(values, ctx));
  }
  const byFormal = new Map<number, IntakePayload[]>();
  for (const row of assessed) {
    const list = byFormal.get(row.formalNo) || [];
    list.push(row);
    byFormal.set(row.formalNo, list);
  }
  const kept: IntakePayload[] = [];
  for (const formalNo of [...byFormal.keys()].sort((a, b) => a - b)) {
    const list = byFormal.get(formalNo)!;
    if (list.every((r) => r.fingerprint === list[0].fingerprint)) {
      kept.push(list[0]);
      if (list.length > 1) {
        list[0].questions = [...list[0].questions, { code: "duplicate_collapsed", blocking: false, text: `正式號 ${formalNo} 有 ${list.length} 行相同指紋（主人、寵物、電話、重量及到達）。只保留第 ${list[0].sourceLine} 行，沒有合併其他行的備註。` }];
        list[0].dedup = "duplicate_kept";
      }
    } else {
      const blocked = list[0];
      blocked.mode = "blocked";
      blocked.dedup = "conflict";
      blocked.questions = [...blocked.questions, { code: "formal_fingerprint_conflict", blocking: true, text: `正式號 ${formalNo} 出現多行，但主人、寵物、電話或重量／到達並不完全相同。不會合成一筆，也不會開單。` }];
      blocked.submittable = false;
      kept.push(blocked);
    }
  }
  const prints = new Map<string, number[]>();
  for (const row of kept) {
    if (row.dedup === "conflict") continue;
    const list = prints.get(row.fingerprint) || [];
    list.push(row.formalNo);
    prints.set(row.fingerprint, list);
  }
  for (const row of kept) {
    const others = (prints.get(row.fingerprint) || []).filter((n) => n !== row.formalNo);
    if (others.length && row.fingerprint.split("|").slice(0, 3).some(Boolean)) {
      row.mode = "blocked";
      row.dedup = "cross";
      row.questions.push({ code: "possible_cross_number_duplicate", blocking: true, text: `與正式號 ${others.join("、")} 的主人、寵物、電話及重量／到達指紋相同。只憑寵物名不會判為同一筆；指紋全同則不會同時開新單。` });
    }
    const withExisting = applyExisting(row, ctx);
    withExisting.submittable = withExisting.mode !== "blocked" && withExisting.dedup !== "conflict" && withExisting.dedup !== "cross" && !withExisting.questions.some((q) => q.blocking);
    base.rows.push(withExisting);
  }
  // backendOnlyNumbers 只存在於後台。預檢只輸出試算表裡的正式號，不會把這些歷史自動編號加成新來源。
  void input.backendOnlyNumbers;
  return base;
}

/** 提交前用同一套規則重算一行。不採用瀏覽器傳來的「已確認」旗標。 */
export function previewSource(values: SourceValues, input: {
  catalog: OfficialVariant[];
  deposit: DepositQuote;
  drivers: string[];
  existing: ExistingIdentity[];
  backendChecked: boolean;
}): IntakePayload {
  const ctx: Ctx = { catalog: input.catalog, deposit: input.deposit, drivers: input.drivers, existing: input.existing, backendChecked: input.backendChecked };
  const row = applyExisting(assess(values, ctx), ctx);
  row.submittable = row.mode !== "blocked" && row.dedup !== "conflict" && row.dedup !== "cross" && !row.questions.some((q) => q.blocking);
  return row;
}
