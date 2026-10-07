// 後台「網站內容」：收費表、紀念精品、商店分類、常見問題及頁頂公告。
// 網站（resoul-landing）以 /api/site-content 讀取並替換頁面預設內容；回覆知識庫的收費代號亦由此產生。
// 頁面（伺服器）及編輯器（瀏覽器）共用，故此檔不可引用伺服器專用模組。
import DEFAULTS from "@/lib/site-content-defaults.json";

export type CremationPrices = { rows: { zh: string; en: string; prices: (number | null)[] }[] };
export type VetPrices = {
  rows: { zh: string; en: string; dayFrom: number | null; dayTo: number | null; nightFrom: number | null; nightTo: number | null }[];
};
export type GriefPrices = { rows: { zh: string; en: string; priceZh: string; priceEn: string }[] };
export type Keepsakes = { items: { icon: string; zh: string; en: string; descZh: string; descEn: string }[] };
export type ShopCategories = {
  items: { key: string; img: string; icon: string; zh: string; en: string; descZh: string; descEn: string; types: string[]; tags: string[]; keywords: string[] }[];
};
export type FaqItem = { qZh: string; qEn: string; aZh: string; aEn: string };
export type Faq = { groups: { icon: string; zh: string; en: string; items: FaqItem[] }[] };
export type Notice = { enabled: boolean; zh: string; en: string; link: string };

export type SiteContent = {
  "prices.cremation": CremationPrices;
  "prices.vet": VetPrices;
  "prices.grief": GriefPrices;
  keepsakes: Keepsakes;
  "shop.categories": ShopCategories;
  "faq.cremation": Faq;
  "faq.euthanasia": Faq;
  "faq.support": Faq;
  notice: Notice;
};
export type SiteKey = keyof SiteContent;

export const SITE_DEFAULTS = DEFAULTS as unknown as SiteContent;
export const SITE_KEYS = Object.keys(SITE_DEFAULTS) as SiteKey[];

// 各區塊名稱及網站上出現的頁面（後台顯示用）
export const SITE_LABELS: Record<SiteKey, { label: string; pages: string }> = {
  "prices.cremation": { label: "火化收費（按體重）", pages: "善終旅程、安排預約接送（中英）" },
  "prices.vet": { label: "上門安樂死參考收費", pages: "上門安樂死（中英）" },
  "prices.grief": { label: "情緒支援收費", pages: "專業輔導轉介及資源（中英）" },
  keepsakes: { label: "紀念精品分類", pages: "善終旅程「紀念精品」分段（中英）" },
  "shop.categories": { label: "商店分類卡", pages: "網上商店（中英）" },
  "faq.cremation": { label: "常見問題：善終旅程", pages: "善終旅程、安排預約接送（中英）" },
  "faq.euthanasia": { label: "常見問題：上門安樂死", pages: "上門安樂死（中英）" },
  "faq.support": { label: "常見問題：情緒支援", pages: "情緒支援（中英）" },
  notice: { label: "頁頂公告", pages: "全站最頂（中英）" },
};

export const PLAN_NAMES = [
  { zh: "風之旅", en: "Breeze" },
  { zh: "雲之旅", en: "Cloud" },
  { zh: "星之旅", en: "Star" },
];

/* ---------- 驗證及整理（伺服器儲存前使用） ---------- */

const MAX_PRICE = 1_000_000;

function str(v: unknown, max: number, label: string, required = false) {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new Error(`請填寫${label}。`);
  if (s.length > max) throw new Error(`${label}太長（最多 ${max} 字）。`);
  return s;
}
function price(v: unknown, label: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_PRICE) throw new Error(`${label}須為 0 至 ${MAX_PRICE.toLocaleString()} 的整數。`);
  return n;
}
function list<T>(v: unknown, label: string, max: number, each: (x: Record<string, unknown>, i: number) => T, min = 1): T[] {
  const a = Array.isArray(v) ? v : [];
  if (a.length < min) throw new Error(`${label}最少要有 ${min} 項。`);
  if (a.length > max) throw new Error(`${label}最多 ${max} 項。`);
  return a.map((x, i) => each((x && typeof x === "object" ? x : {}) as Record<string, unknown>, i));
}
function words(v: unknown, label: string) {
  const a = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,，、\n]/) : [];
  const out = a.map((w) => String(w).trim()).filter(Boolean);
  if (out.length > 30) throw new Error(`${label}最多 30 個。`);
  if (out.some((w) => w.length > 40)) throw new Error(`${label}每個最多 40 字。`);
  return [...new Set(out)];
}
function safeImg(v: unknown) {
  const s = str(v, 300, "圖片網址");
  if (!s) return "";
  if (/^(images\/|\/images\/)[\w./-]+$/i.test(s)) return s;
  try {
    if (new URL(s).protocol === "https:") return s;
  } catch {}
  throw new Error("圖片網址只接受網站內 images/ 路徑或 https 網址。");
}
function safeLink(v: unknown) {
  const s = str(v, 300, "公告連結");
  if (!s) return "";
  if (/^\/(?!\/)\S*$/.test(s)) return s;
  try {
    if (["http:", "https:"].includes(new URL(s).protocol)) return s;
  } catch {}
  throw new Error("公告連結只接受 http(s) 網址或網站內路徑（例如 /booking）。");
}

function faq(v: unknown, fixedGroups: number | null): Faq {
  const data = (v || {}) as Record<string, unknown>;
  const groups = list(data.groups, "分組", 12, (g, gi) => ({
    icon: str(g.icon, 8, "分組圖示"),
    zh: str(g.zh, 60, `第 ${gi + 1} 組中文標題`, true),
    en: str(g.en, 100, `第 ${gi + 1} 組英文標題`, true),
    items: list(g.items, `第 ${gi + 1} 組問題`, 40, (it, ii) => ({
      qZh: str(it.qZh, 200, `第 ${gi + 1} 組第 ${ii + 1} 題中文問題`, true),
      qEn: str(it.qEn, 300, `第 ${gi + 1} 組第 ${ii + 1} 題英文問題`),
      aZh: str(it.aZh, 3000, `第 ${gi + 1} 組第 ${ii + 1} 題中文答案`, true),
      aEn: str(it.aEn, 5000, `第 ${gi + 1} 組第 ${ii + 1} 題英文答案`),
    }), 0),
  }));
  if (fixedGroups !== null && groups.length !== fixedGroups) throw new Error(`此頁的分組須維持 ${fixedGroups} 組（對應網站上的篩選掣）。`);
  return { groups };
}

export function normalizeSiteContent<K extends SiteKey>(key: K, raw: unknown): SiteContent[K] {
  const data = (raw || {}) as Record<string, unknown>;
  switch (key) {
    case "prices.cremation":
      return {
        rows: list(data.rows, "體重級別", 20, (r, i) => {
          const prices = Array.isArray(r.prices) ? r.prices : [];
          return {
            zh: str(r.zh, 40, `第 ${i + 1} 行中文體重`, true),
            en: str(r.en, 60, `第 ${i + 1} 行英文體重`, true),
            prices: PLAN_NAMES.map((p, j) => {
              const n = price(prices[j], `第 ${i + 1} 行${p.zh}價錢`);
              if (n === null) throw new Error(`請填寫第 ${i + 1} 行${p.zh}價錢。`);
              return n;
            }),
          };
        }),
      } as SiteContent[K];
    case "prices.vet":
      return {
        rows: list(data.rows, "體重級別", 20, (r, i) => {
          const row = {
            zh: str(r.zh, 40, `第 ${i + 1} 行中文體重`, true),
            en: str(r.en, 60, `第 ${i + 1} 行英文體重`, true),
            dayFrom: price(r.dayFrom, `第 ${i + 1} 行日間最低價`),
            dayTo: price(r.dayTo, `第 ${i + 1} 行日間最高價`),
            nightFrom: price(r.nightFrom, `第 ${i + 1} 行晚間最低價`),
            nightTo: price(r.nightTo, `第 ${i + 1} 行晚間最高價`),
          };
          if ((row.dayFrom === null) !== (row.nightFrom === null)) throw new Error(`第 ${i + 1} 行：日間及晚間價錢須同時填寫，或同時留空（＝個別報價）。`);
          if (row.dayTo !== null && row.dayFrom !== null && row.dayTo < row.dayFrom) throw new Error(`第 ${i + 1} 行日間最高價不可低於最低價。`);
          if (row.nightTo !== null && row.nightFrom !== null && row.nightTo < row.nightFrom) throw new Error(`第 ${i + 1} 行晚間最高價不可低於最低價。`);
          return row;
        }),
      } as SiteContent[K];
    case "prices.grief":
      return {
        rows: list(data.rows, "收費項目", 20, (r, i) => ({
          zh: str(r.zh, 80, `第 ${i + 1} 項中文名稱`, true),
          en: str(r.en, 120, `第 ${i + 1} 項英文名稱`, true),
          priceZh: str(r.priceZh, 80, `第 ${i + 1} 項中文收費`, true),
          priceEn: str(r.priceEn, 120, `第 ${i + 1} 項英文收費`, true),
        })),
      } as SiteContent[K];
    case "keepsakes":
      return {
        items: list(data.items, "分類", 12, (it, i) => ({
          icon: str(it.icon, 8, `第 ${i + 1} 項圖示`),
          zh: str(it.zh, 40, `第 ${i + 1} 項中文名稱`, true),
          en: str(it.en, 80, `第 ${i + 1} 項英文名稱`, true),
          descZh: str(it.descZh, 120, `第 ${i + 1} 項中文說明`),
          descEn: str(it.descEn, 200, `第 ${i + 1} 項英文說明`),
        })),
      } as SiteContent[K];
    case "shop.categories": {
      const seen = new Set<string>();
      return {
        items: list(data.items, "分類卡", 16, (it, i) => {
          let key = str(it.key, 30, `第 ${i + 1} 張卡代號`).toLowerCase().replace(/[^a-z0-9-]/g, "");
          if (!key) key = `c${i + 1}`;
          while (seen.has(key)) key = `${key}-${i + 1}`;
          seen.add(key);
          return {
            key,
            img: safeImg(it.img),
            icon: str(it.icon, 8, `第 ${i + 1} 張卡圖示`),
            zh: str(it.zh, 40, `第 ${i + 1} 張卡中文名稱`, true),
            en: str(it.en, 80, `第 ${i + 1} 張卡英文名稱`, true),
            descZh: str(it.descZh, 120, `第 ${i + 1} 張卡中文說明`),
            descEn: str(it.descEn, 200, `第 ${i + 1} 張卡英文說明`),
            types: words(it.types, `第 ${i + 1} 張卡 Shopify 產品類型`),
            tags: words(it.tags, `第 ${i + 1} 張卡 Shopify 標籤`),
            keywords: words(it.keywords, `第 ${i + 1} 張卡後備關鍵字`),
          };
        }),
      } as SiteContent[K];
    }
    case "faq.cremation":
    case "faq.euthanasia":
      return faq(raw, null) as SiteContent[K];
    case "faq.support":
      return faq(raw, SITE_DEFAULTS["faq.support"].groups.length) as SiteContent[K];
    case "notice": {
      const enabled = data.enabled === true;
      const zh = str(data.zh, 200, "中文公告", enabled);
      return { enabled, zh, en: str(data.en, 300, "英文公告"), link: safeLink(data.link) } as SiteContent[K];
    }
  }
  throw new Error("未知的網站內容區塊。");
}

/* ---------- 回覆知識庫收費代號 ---------- */

export const PRICE_TOKENS = ["{風之旅起價}", "{雲之旅起價}", "{星之旅起價}", "{火化收費表}", "{獸醫收費表}", "{情緒支援收費表}"] as const;
export type PriceTokens = Record<string, { zh: string; en: string }>;

const hk = (n: number) => `HK$${n.toLocaleString("en-US")}`;
const range = (a: number | null, b: number | null) => (a === null ? null : b !== null && b !== a ? `${hk(a)}–${b.toLocaleString("en-US")}` : hk(a));

// 由網站內容產生收費代號的中英文字（回覆助手插入範本時填入）
export function priceTokens(content: Pick<SiteContent, "prices.cremation" | "prices.vet" | "prices.grief">): PriceTokens {
  const out: PriceTokens = {};
  const rows = content["prices.cremation"].rows;
  PLAN_NAMES.forEach((p, i) => {
    const vals = rows.map((r) => r.prices[i]).filter((n): n is number => typeof n === "number");
    const v = vals.length ? hk(Math.min(...vals)) : "";
    out[`{${p.zh}起價}`] = { zh: v, en: v };
  });
  out["{火化收費表}"] = {
    zh: rows.map((r) => `${r.zh}：${r.prices.map((n, i) => (i === 0 ? hk(n ?? 0) : (n ?? 0).toLocaleString("en-US"))).join("／")}`).join("\n"),
    en: rows.map((r) => `${r.en || r.zh}: ${r.prices.map((n, i) => (i === 0 ? hk(n ?? 0) : (n ?? 0).toLocaleString("en-US"))).join(" / ")}`).join("\n"),
  };
  const vet = content["prices.vet"].rows;
  out["{獸醫收費表}"] = {
    zh: vet.map((r) => {
      const d = range(r.dayFrom, r.dayTo), n = range(r.nightFrom, r.nightTo);
      return `${r.zh}：${d && n ? `日間 ${d}／晚間 ${n}` : "個別報價"}`;
    }).join("\n"),
    en: vet.map((r) => {
      const d = range(r.dayFrom, r.dayTo), n = range(r.nightFrom, r.nightTo);
      return `${r.en || r.zh}: ${d && n ? `day ${d} / evening ${n}` : "quoted individually"}`;
    }).join("\n"),
  };
  const grief = content["prices.grief"].rows;
  out["{情緒支援收費表}"] = {
    zh: grief.map((r) => `・${r.zh}：${r.priceZh}`).join("\n"),
    en: grief.map((r) => `• ${r.en || r.zh}: ${r.priceEn || r.priceZh}`).join("\n"),
  };
  return out;
}
