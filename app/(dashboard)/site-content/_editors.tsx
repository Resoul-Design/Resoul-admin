"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveSiteContent } from "./actions";
import {
  PLAN_NAMES,
  type CremationPrices,
  type Faq,
  type GriefPrices,
  type Keepsakes,
  type Notice,
  type ShopCategories,
  type SiteKey,
  type VetPrices,
} from "@/lib/site-content";

const inputClass = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const smallBtn = "rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1 text-xs hover:bg-[var(--cream)] disabled:opacity-40";
const addBtn = "rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-sm text-[var(--soft)] hover:bg-[var(--cream)]";

/* ---------- 共用 ---------- */

function move<T>(list: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowActions({ i, count, onMove, onRemove, removeLabel = "刪除" }: { i: number; count: number; onMove: (d: -1 | 1) => void; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button type="button" className={smallBtn} disabled={i === 0} onClick={() => onMove(-1)} aria-label="上移">↑</button>
      <button type="button" className={smallBtn} disabled={i === count - 1} onClick={() => onMove(1)} aria-label="下移">↓</button>
      {onRemove && (
        <button type="button" className={smallBtn + " text-red-700"} onClick={() => { if (window.confirm(`確定${removeLabel}？（按「儲存」後才生效）`)) onRemove(); }}>
          {removeLabel}
        </button>
      )}
    </span>
  );
}

// 每個區塊的編輯狀態、未儲存提示及儲存列
function useSection<T>(siteKey: SiteKey, initial: T) {
  const router = useRouter();
  const [data, setData] = useState<T>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (next: T | ((prev: T) => T)) => {
    setData(next);
    setDirty(true);
    setSavedAt("");
  };
  const save = () => {
    setError("");
    startTransition(async () => {
      const res = await saveSiteContent(siteKey, data);
      if (res.error) setError(res.error);
      else {
        setDirty(false);
        setSavedAt(res.savedAt || "");
        router.refresh();
      }
    });
  };
  const bar = <SaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} onSave={save} />;
  return { data, update, bar };
}

function SaveBar({ dirty, pending, error, savedAt, onSave }: { dirty: boolean; pending: boolean; error: string; savedAt: string; onSave: () => void }) {
  return (
    <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-lg">
      <span className={"text-sm " + (error ? "text-red-700" : "text-[var(--soft)]")} role={error ? "alert" : undefined}>
        {error || (dirty ? "有未儲存修改" : savedAt ? "已儲存，網站約一分鐘內更新" : "所有修改已儲存")}
      </span>
      <button type="button" onClick={onSave} disabled={!dirty || pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "儲存中…" : "儲存"}
      </button>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">{children}</div>;
}

const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[,\s]/g, "")));

/* ---------- 火化收費 ---------- */

export function CremationPricesEditor({ initial }: { initial: CremationPrices }) {
  const { data, update, bar } = useSection("prices.cremation", initial);
  const set = (i: number, patch: Partial<CremationPrices["rows"][number]>) =>
    update((d) => ({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const from = PLAN_NAMES.map((_, i) => {
    const vals = data.rows.map((r) => r.prices[i]).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return vals.length ? Math.min(...vals) : null;
  });
  return (
    <div>
      <Card>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_repeat(3,7rem)_auto] gap-2 pb-2 text-xs text-[var(--soft)] sm:grid">
          <span>體重（中文）</span><span>體重（英文）</span>{PLAN_NAMES.map((p) => <span key={p.zh}>{p.zh}（HK$）</span>)}<span className="w-[7.5rem]" />
        </div>
        <div className="space-y-3 sm:space-y-2">
          {data.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 border-b border-[var(--line)] pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_repeat(3,7rem)_auto] sm:items-center sm:border-0 sm:pb-0">
              <input aria-label="體重（中文）" value={r.zh} onChange={(e) => set(i, { zh: e.target.value })} className={inputClass} placeholder="1 kg 以下" />
              <input aria-label="體重（英文）" value={r.en} onChange={(e) => set(i, { en: e.target.value })} className={inputClass} placeholder="Under 1 kg" />
              {PLAN_NAMES.map((p, j) => (
                <label key={p.zh} className="text-xs text-[var(--soft)] sm:text-sm sm:text-[var(--ink)]">
                  <span className="sm:hidden">{p.zh}</span>
                  <input inputMode="numeric" aria-label={`${r.zh} ${p.zh}`} value={numText(r.prices[j])} onChange={(e) => set(i, { prices: r.prices.map((v, k) => (k === j ? toNum(e.target.value) : v)) })} className={inputClass} />
                </label>
              ))}
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <RowActions i={i} count={data.rows.length} onMove={(d) => update((x) => ({ rows: move(x.rows, i, d) }))} onRemove={data.rows.length > 1 ? () => update((x) => ({ rows: x.rows.filter((_, j) => j !== i) })) : undefined} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={addBtn + " mt-3"} onClick={() => update((x) => ({ rows: [...x.rows, { zh: "", en: "", prices: [null, null, null] }] }))}>＋ 新增體重級別</button>
        <p className="mt-3 text-xs leading-5 text-[var(--soft)]">
          比較表的「參考價格」自動使用每個旅程的最低價：{PLAN_NAMES.map((p, i) => `${p.zh} ${from[i] !== null ? `HK$${from[i]!.toLocaleString("en-US")} 起` : "—"}`).join("　")}。
          網上付款金額以 Shopify 產品價錢為準，修改收費時須同步修改 Shopify 火化方案的價錢。
        </p>
      </Card>
      {bar}
    </div>
  );
}

/* ---------- 上門安樂死收費 ---------- */

export function VetPricesEditor({ initial }: { initial: VetPrices }) {
  const { data, update, bar } = useSection("prices.vet", initial);
  type Row = VetPrices["rows"][number];
  const set = (i: number, patch: Partial<Row>) => update((d) => ({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const nums: { key: keyof Row; label: string }[] = [
    { key: "dayFrom", label: "日間最低" },
    { key: "dayTo", label: "日間最高" },
    { key: "nightFrom", label: "晚間最低" },
    { key: "nightTo", label: "晚間最高" },
  ];
  return (
    <div>
      <Card>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_repeat(4,6.5rem)_auto] gap-2 pb-2 text-xs text-[var(--soft)] sm:grid">
          <span>體重（中文）</span><span>體重（英文）</span>{nums.map((n) => <span key={n.key}>{n.label}</span>)}<span className="w-[7.5rem]" />
        </div>
        <div className="space-y-3 sm:space-y-2">
          {data.rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 border-b border-[var(--line)] pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_repeat(4,6.5rem)_auto] sm:items-center sm:border-0 sm:pb-0">
              <input aria-label="體重（中文）" value={r.zh} onChange={(e) => set(i, { zh: e.target.value })} className={inputClass} />
              <input aria-label="體重（英文）" value={r.en} onChange={(e) => set(i, { en: e.target.value })} className={inputClass} />
              {nums.map((n) => (
                <label key={n.key} className="text-xs text-[var(--soft)]">
                  <span className="sm:hidden">{n.label}</span>
                  <input inputMode="numeric" aria-label={`${r.zh} ${n.label}`} value={numText(r[n.key] as number | null)} onChange={(e) => set(i, { [n.key]: toNum(e.target.value) } as Partial<Row>)} className={inputClass} placeholder="—" />
                </label>
              ))}
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <RowActions i={i} count={data.rows.length} onMove={(d) => update((x) => ({ rows: move(x.rows, i, d) }))} onRemove={data.rows.length > 1 ? () => update((x) => ({ rows: x.rows.filter((_, j) => j !== i) })) : undefined} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={addBtn + " mt-3"} onClick={() => update((x) => ({ rows: [...x.rows, { zh: "", en: "", dayFrom: null, dayTo: null, nightFrom: null, nightTo: null }] }))}>＋ 新增體重級別</button>
        <p className="mt-3 text-xs leading-5 text-[var(--soft)]">價錢全部留空的一行，網站顯示「個別報價／Quoted individually」。最高價可留空，只顯示單一價錢。</p>
      </Card>
      {bar}
    </div>
  );
}

/* ---------- 情緒支援收費 ---------- */

export function GriefPricesEditor({ initial }: { initial: GriefPrices }) {
  const { data, update, bar } = useSection("prices.grief", initial);
  type Row = GriefPrices["rows"][number];
  const set = (i: number, patch: Partial<Row>) => update((d) => ({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  return (
    <div>
      <Card>
        <div className="space-y-3">
          {data.rows.map((r, i) => (
            <div key={i} className="grid gap-2 border-b border-[var(--line)] pb-3 last:border-0 sm:grid-cols-2">
              <label className="text-xs text-[var(--soft)]">項目（中文）<input value={r.zh} onChange={(e) => set(i, { zh: e.target.value })} className={inputClass + " mt-1"} /></label>
              <label className="text-xs text-[var(--soft)]">項目（英文）<input value={r.en} onChange={(e) => set(i, { en: e.target.value })} className={inputClass + " mt-1"} /></label>
              <label className="text-xs text-[var(--soft)]">收費（中文）<input value={r.priceZh} onChange={(e) => set(i, { priceZh: e.target.value })} className={inputClass + " mt-1"} placeholder="例如 HK$380 至 580、免費" /></label>
              <label className="text-xs text-[var(--soft)]">收費（英文）<input value={r.priceEn} onChange={(e) => set(i, { priceEn: e.target.value })} className={inputClass + " mt-1"} placeholder="e.g. HK$380–580, Free" /></label>
              <div className="flex justify-end sm:col-span-2">
                <RowActions i={i} count={data.rows.length} onMove={(d) => update((x) => ({ rows: move(x.rows, i, d) }))} onRemove={data.rows.length > 1 ? () => update((x) => ({ rows: x.rows.filter((_, j) => j !== i) })) : undefined} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={addBtn + " mt-3"} onClick={() => update((x) => ({ rows: [...x.rows, { zh: "", en: "", priceZh: "", priceEn: "" }] }))}>＋ 新增收費項目</button>
      </Card>
      {bar}
    </div>
  );
}

/* ---------- 紀念精品分類 ---------- */

export function KeepsakesEditor({ initial }: { initial: Keepsakes }) {
  const { data, update, bar } = useSection("keepsakes", initial);
  type Item = Keepsakes["items"][number];
  const set = (i: number, patch: Partial<Item>) => update((d) => ({ items: d.items.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.items.map((it, i) => (
          <Card key={i}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{it.icon} {it.zh || `分類 ${i + 1}`}</span>
              <RowActions i={i} count={data.items.length} onMove={(d) => update((x) => ({ items: move(x.items, i, d) }))} onRemove={data.items.length > 1 ? () => update((x) => ({ items: x.items.filter((_, j) => j !== i) })) : undefined} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="text-xs text-[var(--soft)]">圖示<input value={it.icon} onChange={(e) => set(i, { icon: e.target.value })} className={inputClass + " mt-1 text-center"} /></label>
              <label className="text-xs text-[var(--soft)]">名稱（中文）<input value={it.zh} onChange={(e) => set(i, { zh: e.target.value })} className={inputClass + " mt-1"} /></label>
              <label className="text-xs text-[var(--soft)]">名稱（英文）<input value={it.en} onChange={(e) => set(i, { en: e.target.value })} className={inputClass + " mt-1"} /></label>
            </div>
            <label className="mt-2 block text-xs text-[var(--soft)]">說明（中文）<textarea rows={2} value={it.descZh} onChange={(e) => set(i, { descZh: e.target.value })} className={inputClass + " mt-1"} /></label>
            <label className="mt-2 block text-xs text-[var(--soft)]">說明（英文）<textarea rows={2} value={it.descEn} onChange={(e) => set(i, { descEn: e.target.value })} className={inputClass + " mt-1"} /></label>
          </Card>
        ))}
      </div>
      <button type="button" className={addBtn + " mt-3"} onClick={() => update((x) => ({ items: [...x.items, { icon: "✨", zh: "", en: "", descZh: "", descEn: "" }] }))}>＋ 新增分類</button>
      {bar}
    </div>
  );
}

/* ---------- 商店分類卡 ---------- */

type ShopItem = Omit<ShopCategories["items"][number], "types" | "tags" | "keywords"> & { types: string[] | string; tags: string[] | string; keywords: string[] | string };
const joinWords = (v: string[] | string) => (Array.isArray(v) ? v.join("、") : v);

export function ShopCategoriesEditor({ initial, landingUrl }: { initial: ShopCategories; landingUrl: string }) {
  const { data, update, bar } = useSection<{ items: ShopItem[] }>("shop.categories", initial);
  const set = (i: number, patch: Partial<ShopItem>) => update((d) => ({ items: d.items.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const imgSrc = (img: string) => (!img ? "" : /^https:/i.test(img) ? img : `${landingUrl}/${img.replace(/^\//, "")}`);
  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.items.map((it, i) => (
          <Card key={it.key || i}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {imgSrc(it.img) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgSrc(it.img)} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <span className="truncate">{it.icon} {it.zh || `分類卡 ${i + 1}`}</span>
              </span>
              <RowActions i={i} count={data.items.length} onMove={(d) => update((x) => ({ items: move(x.items, i, d) }))} onRemove={data.items.length > 1 ? () => update((x) => ({ items: x.items.filter((_, j) => j !== i) })) : undefined} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="text-xs text-[var(--soft)]">圖示<input value={it.icon} onChange={(e) => set(i, { icon: e.target.value })} className={inputClass + " mt-1 text-center"} /></label>
              <label className="text-xs text-[var(--soft)]">名稱（中文）<input value={it.zh} onChange={(e) => set(i, { zh: e.target.value })} className={inputClass + " mt-1"} /></label>
              <label className="text-xs text-[var(--soft)]">名稱（英文）<input value={it.en} onChange={(e) => set(i, { en: e.target.value })} className={inputClass + " mt-1"} /></label>
            </div>
            <label className="mt-2 block text-xs text-[var(--soft)]">說明（中文）<input value={it.descZh} onChange={(e) => set(i, { descZh: e.target.value })} className={inputClass + " mt-1"} /></label>
            <label className="mt-2 block text-xs text-[var(--soft)]">說明（英文）<input value={it.descEn} onChange={(e) => set(i, { descEn: e.target.value })} className={inputClass + " mt-1"} /></label>
            <label className="mt-2 block text-xs text-[var(--soft)]">背景圖片<input value={it.img} onChange={(e) => set(i, { img: e.target.value })} className={inputClass + " mt-1"} placeholder="images/cat-urn.jpg 或 https:// 網址" /></label>
            <label className="mt-2 block text-xs text-[var(--soft)]">Shopify 產品類型（中文名稱，多個以頓號分隔）<input value={joinWords(it.types)} onChange={(e) => set(i, { types: e.target.value })} className={inputClass + " mt-1"} placeholder="例如 骨灰龕" /></label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-[var(--soft)]">Shopify 標籤（以頓號分隔）<input value={joinWords(it.tags)} onChange={(e) => set(i, { tags: e.target.value })} className={inputClass + " mt-1"} /></label>
              <label className="text-xs text-[var(--soft)]">後備關鍵字（以頓號分隔）<input value={joinWords(it.keywords)} onChange={(e) => set(i, { keywords: e.target.value })} className={inputClass + " mt-1"} /></label>
            </div>
          </Card>
        ))}
      </div>
      <button type="button" className={addBtn + " mt-3"} onClick={() => update((x) => ({ items: [...x.items, { key: "", img: "", icon: "✨", zh: "", en: "", descZh: "", descEn: "", types: [], tags: [], keywords: [] }] }))}>＋ 新增分類卡</button>
      <p className="mt-3 text-xs leading-5 text-[var(--soft)]">
        客人按分類卡時，顯示 Shopify「產品類型」與此卡相同的產品（填產品類型的中文部分，例如「骨灰龕」；一張卡可對應多個類型）。只對應一個類型時，商店的篩選掣亦會使用此卡的名稱。
        亦可改用「Shopify 標籤」或「後備關鍵字」（比對產品名稱、類型及標籤）；三欄都留空＝顯示全部產品。「預約服務」及「火化服務」類產品不會在商店顯示。
        背景圖片可用網站 images/ 路徑或 https 圖片網址（例如 Shopify 產品相片）。
      </p>
      {bar}
    </div>
  );
}

/* ---------- 常見問題 ---------- */

// 每題可收合；新加入（未有問題）的題目預設展開
function FaqItemBox({ title, actions, children }: { title: string; actions: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(() => !title);
  return (
    <details className="rounded-lg border border-[var(--line)] bg-white" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{title || "（新問題）"}</span>
        <span onClick={(e) => e.preventDefault()}>{actions}</span>
      </summary>
      <div className="grid gap-2 border-t border-[var(--line)] p-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function FaqEditor({ siteKey, initial, fixedGroups, withIcons }: { siteKey: SiteKey; initial: Faq; fixedGroups: boolean; withIcons: boolean }) {
  const { data, update, bar } = useSection(siteKey, initial);
  type Group = Faq["groups"][number];
  type Item = Group["items"][number];
  const setGroup = (gi: number, patch: Partial<Group>) => update((d: Faq) => ({ groups: d.groups.map((g, j) => (j === gi ? { ...g, ...patch } : g)) }));
  const setItems = (gi: number, fn: (items: Item[]) => Item[]) => update((d: Faq) => ({ groups: d.groups.map((g, j) => (j === gi ? { ...g, items: fn(g.items) } : g)) }));
  const setItem = (gi: number, ii: number, patch: Partial<Item>) => setItems(gi, (items) => items.map((it, k) => (k === ii ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-4">
      {data.groups.map((g, gi) => (
        <Card key={gi}>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            {withIcons && <label className="w-16 text-xs text-[var(--soft)]">圖示<input value={g.icon} onChange={(e) => setGroup(gi, { icon: e.target.value })} className={inputClass + " mt-1 text-center"} /></label>}
            <label className="min-w-[12rem] flex-1 text-xs text-[var(--soft)]">分組標題（中文）<input value={g.zh} onChange={(e) => setGroup(gi, { zh: e.target.value })} className={inputClass + " mt-1 font-medium"} /></label>
            <label className="min-w-[12rem] flex-1 text-xs text-[var(--soft)]">分組標題（英文）<input value={g.en} onChange={(e) => setGroup(gi, { en: e.target.value })} className={inputClass + " mt-1"} /></label>
            {!fixedGroups && (
              <RowActions i={gi} count={data.groups.length} removeLabel="刪除分組" onMove={(d) => update((x: Faq) => ({ groups: move(x.groups, gi, d) }))} onRemove={data.groups.length > 1 ? () => update((x: Faq) => ({ groups: x.groups.filter((_, j) => j !== gi) })) : undefined} />
            )}
          </div>
          <div className="space-y-2">
            {g.items.map((it, ii) => (
              <FaqItemBox key={ii} title={it.qZh} actions={<RowActions i={ii} count={g.items.length} onMove={(d) => setItems(gi, (items) => move(items, ii, d))} onRemove={() => setItems(gi, (items) => items.filter((_, k) => k !== ii))} />}>
                <label className="text-xs text-[var(--soft)]">問題（中文）<input value={it.qZh} onChange={(e) => setItem(gi, ii, { qZh: e.target.value })} className={inputClass + " mt-1"} /></label>
                <label className="text-xs text-[var(--soft)]">問題（英文）<input value={it.qEn} onChange={(e) => setItem(gi, ii, { qEn: e.target.value })} className={inputClass + " mt-1"} /></label>
                <label className="text-xs text-[var(--soft)]">答案（中文）<textarea rows={5} value={it.aZh} onChange={(e) => setItem(gi, ii, { aZh: e.target.value })} className={inputClass + " mt-1 leading-6"} /></label>
                <label className="text-xs text-[var(--soft)]">答案（英文）<textarea rows={5} value={it.aEn} onChange={(e) => setItem(gi, ii, { aEn: e.target.value })} className={inputClass + " mt-1 leading-6"} /></label>
              </FaqItemBox>
            ))}
          </div>
          <button type="button" className={addBtn + " mt-3"} onClick={() => setItems(gi, (items) => [...items, { qZh: "", qEn: "", aZh: "", aEn: "" }])}>＋ 新增問題</button>
        </Card>
      ))}
      {!fixedGroups && (
        <button type="button" className={addBtn} onClick={() => update((x: Faq) => ({ groups: [...x.groups, { icon: "", zh: "", en: "", items: [{ qZh: "", qEn: "", aZh: "", aEn: "" }] }] }))}>＋ 新增分組</button>
      )}
      <p className="text-xs leading-5 text-[var(--soft)]">
        答案中空一行即分段。{fixedGroups ? "此頁分組對應網站上的心情篩選掣，只可修改標題及問題，不可增減分組。" : ""}問題或答案的英文欄留空時，該題不會在英文網站顯示。
      </p>
      {bar}
    </div>
  );
}

/* ---------- 頁頂公告 ---------- */

export function NoticeEditor({ initial }: { initial: Notice }) {
  const { data, update, bar } = useSection("notice", initial);
  const set = (patch: Partial<Notice>) => update((d) => ({ ...d, ...patch }));
  return (
    <div>
      <Card>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={data.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4 accent-[var(--gold)]" />
          在網站最頂顯示公告
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--soft)]">公告（中文）<textarea rows={2} value={data.zh} onChange={(e) => set({ zh: e.target.value })} className={inputClass + " mt-1"} placeholder="例如：農曆新年期間接送服務照常，火化安排或需延後一至兩日。" /></label>
          <label className="text-xs text-[var(--soft)]">公告（英文）<textarea rows={2} value={data.en} onChange={(e) => set({ en: e.target.value })} className={inputClass + " mt-1"} /></label>
        </div>
        <label className="mt-2 block text-xs text-[var(--soft)]">連結（可留空）<input value={data.link} onChange={(e) => set({ link: e.target.value })} className={inputClass + " mt-1"} placeholder="/booking 或 https://…" /></label>
        {data.enabled && data.zh.trim() && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-[var(--soft)]">預覽</p>
            <div className="rounded-lg bg-[#7a5f3a] px-4 py-2 text-center text-sm text-white">{data.zh}{data.link ? " →" : ""}</div>
          </div>
        )}
      </Card>
      {bar}
    </div>
  );
}
