"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DraftCatalogProduct } from "@/lib/catalog";
import { ORDER_TYPES, ORDER_TYPE_MAP, PAYMENT_INTENTS, RECEIVED_METHODS, type OrderType, type PaymentIntent } from "@/lib/order-types";
import { createOrder, lookupCustomer, type CustomerMatch, type NewOrderLine, type PetProfile } from "./actions";
import { URN_PICKUP_OPTIONS, invoiceRemarkLines, suggestUrnPickup, type UrnPickup } from "@/lib/invoice-remark";
import { PET_GENDERS } from "@/lib/order-types";
import { DateOrPending, TimePicker, UrnPicker, type UrnProduct } from "../_pickers";

export type NewOrderCatalog = {
  cremation: DraftCatalogProduct[];
  deposit: DraftCatalogProduct[];
  souvenir: DraftCatalogProduct[];
  error: string;
  vet: { base: number; surcharges: { zh: string; price: number }[] };
  slots: { zh: string; label: string }[];
};
export type NewOrderPrefill = { type?: OrderType; name?: string; phone?: string; email?: string; projectNo?: string; petName?: string; pet?: PetProfile | null };

const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const label = "block text-sm";
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const price = (v?: { price: string | null }) => Number(v?.price || 0);

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-medium">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--gold)] text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

// 由產品類型→產品→款式揀選商品（紀念品、加購）
function LinePicker({ products, lines, onChange }: { products: DraftCatalogProduct[]; lines: NewOrderLine[]; onChange: (lines: NewOrderLine[]) => void }) {
  const types = useMemo(() => [...new Set(products.map((p) => p.productType))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [products]);
  const [type, setType] = useState(types[0] || "");
  const inType = products.filter((p) => p.productType === type);
  const [productId, setProductId] = useState("");
  const product = inType.find((p) => p.id === productId) || inType[0];
  const [variantId, setVariantId] = useState("");
  const variant = product?.variants.find((v) => v.id === variantId) || product?.variants[0];
  const [qty, setQty] = useState(1);
  const byId = useMemo(() => new Map(products.flatMap((p) => p.variants.map((v) => [v.id, { p, v }] as const))), [products]);
  function add() {
    if (!variant) return;
    const found = lines.find((l) => l.variantId === variant.id);
    onChange(found ? lines.map((l) => (l.variantId === variant.id ? { ...l, quantity: Math.min(99, l.quantity + qty) } : l)) : [...lines, { variantId: variant.id, quantity: qty }]);
    setQty(1);
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1.2fr_5rem_auto]">
        <select value={type} onChange={(e) => { setType(e.target.value); setProductId(""); setVariantId(""); }} className={input} aria-label="產品類型">
          {types.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={product?.id || ""} onChange={(e) => { setProductId(e.target.value); setVariantId(""); }} className={input} aria-label="產品">
          {inType.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select value={variant?.id || ""} onChange={(e) => setVariantId(e.target.value)} className={input} aria-label="款式">
          {product?.variants.map((v) => <option key={v.id} value={v.id}>{v.title === "Default Title" ? "標準" : v.title} · {hk(price(v))}</option>)}
        </select>
        <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className={input} aria-label="數量" />
        <button type="button" onClick={add} disabled={!variant} className="rounded-lg border border-[var(--gold)] px-3 py-2 text-sm text-[var(--gold)] hover:bg-[var(--cream)] disabled:opacity-50">加入</button>
      </div>
      {lines.length > 0 && (
        <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-white text-sm">
          {lines.map((l) => {
            const hit = byId.get(l.variantId);
            return (
              <li key={l.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">{hit ? `${hit.p.title}${hit.v.title !== "Default Title" ? `（${hit.v.title}）` : ""}` : l.variantId} × {l.quantity}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums">{hk(price(hit?.v) * l.quantity)}</span>
                  <button type="button" onClick={() => onChange(lines.filter((x) => x.variantId !== l.variantId))} className="text-xs text-red-700 hover:underline">移除</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NewOrderForm({ catalog, allowed, prefill, drivers = [] }: { catalog: NewOrderCatalog; allowed: OrderType[]; prefill: NewOrderPrefill; drivers?: string[] }) {
  const router = useRouter();
  const [clientToken] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  // A. 客人
  const [phone, setPhone] = useState(prefill.phone || "");
  const [name, setName] = useState(prefill.name || "");
  const [email, setEmail] = useState(prefill.email || "");
  const [referrer, setReferrer] = useState("");
  const [match, setMatch] = useState<CustomerMatch | null | undefined>(undefined);
  const [projectNo, setProjectNo] = useState(prefill.projectNo || "");
  const [looking, startLook] = useTransition();
  function lookup() {
    if (phone.replace(/\D/g, "").length < 8) return;
    startLook(async () => {
      const m = await lookupCustomer(phone);
      setMatch(m);
      if (m) {
        if (!name) setName(m.name);
        if (!email && m.email) setEmail(m.email);
        if (!petName && m.pets[0]) setPetName(m.pets[0]);
        // 同一寵物：預先填入上次的寵物資料（只填空白欄位）
        if (m.petProfile && (!petName || petName === m.petProfile.name)) fillPet(m.petProfile);
        if (!projectNo && m.projects[0]) setProjectNo(m.projects[0].projectNo);
      }
    });
  }

  // B. 類型
  const [type, setType] = useState<OrderType | "">(prefill.type && allowed.includes(prefill.type) ? prefill.type : allowed.length === 1 ? allowed[0] : "");

  // C. 共用欄位
  const [petName, setPetName] = useState(prefill.petName || "");
  const [petType, setPetType] = useState(prefill.pet?.petType || "");
  const needPet = type === "deposit" || type === "cremation";
  // 接送訂金及善終／告別套餐必填的寵物資料
  const [petWeight, setPetWeight] = useState(prefill.pet?.weightKg || "");
  const [petBreed, setPetBreed] = useState(prefill.pet?.breed || "");
  const [petGender, setPetGender] = useState(prefill.pet?.gender || "");
  const [petAge, setPetAge] = useState(prefill.pet?.age || "");
  const [serviceDate, setServiceDate] = useState("");
  const [ceremonyTime, setCeremonyTime] = useState(""); // 善終／告別套餐的火化時間
  // 骨灰龕資料（善終／告別套餐）
  const [urnType, setUrnType] = useState("");
  const [urnPickupDate, setUrnPickupDate] = useState("");
  const [urnRemark, setUrnRemark] = useState("");
  const urnProducts: UrnProduct[] = useMemo(() => catalog.souvenir.filter((p) => p.productType.includes("骨灰龕")).map((p) => ({ id: p.id, title: p.title, variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku })) })), [catalog.souvenir]);
  const [slot, setSlot] = useState("");
  const [driver, setDriver] = useState("");
  const [address, setAddress] = useState(prefill.pet?.address || "");
  function fillPet(p: PetProfile) {
    setPetWeight((v) => v || p.weightKg); setPetBreed((v) => v || p.breed); setPetGender((v) => v || (["公", "母", "不詳"].includes(p.gender) ? p.gender : ""));
    setPetAge((v) => v || p.age); setPetType((v) => v || p.petType); setAddress((v) => v || p.address);
  }
  const [publicNote, setPublicNote] = useState("");
  const [urnPickup, setUrnPickup] = useState<UrnPickup | "">("");
  const [internalNote, setInternalNote] = useState("");
  const [intent, setIntent] = useState<PaymentIntent>("link");
  const [method, setMethod] = useState("");
  const [more, setMore] = useState(false);
  const [creditId, setCreditId] = useState("");

  // C. 類型欄位（切換類型時清空）
  const [planId, setPlanId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [surcharges, setSurcharges] = useState<number[]>([]);
  const [otherTitle, setOtherTitle] = useState("");
  const [otherAmount, setOtherAmount] = useState("");
  const [otherDesc, setOtherDesc] = useState("");
  const typeDirty = !!(planId || variantId || lines.length || surcharges.length || otherTitle || otherAmount || otherDesc);

  function chooseType(next: OrderType) {
    if (next === type) return;
    if (typeDirty && !window.confirm("切換類型會清除已填的類型資料（客人資料會保留）。繼續？")) return;
    setType(next);
    setPlanId("");
    setVariantId("");
    setLines([]);
    setSurcharges([]);
    setOtherTitle("");
    setOtherAmount("");
    setOtherDesc("");
    setError("");
  }

  const plan = catalog.cremation.find((p) => p.id === planId);
  const depositVariants = catalog.deposit.flatMap((p) => p.variants.map((v) => ({ p, v })));
  const depositVariant = depositVariants.find((x) => x.v.id === variantId) || depositVariants[0];
  const souvenirById = useMemo(() => new Map(catalog.souvenir.flatMap((p) => p.variants.map((v) => [v.id, v] as const))), [catalog.souvenir]);
  const linesTotal = lines.reduce((n, l) => n + price(souvenirById.get(l.variantId)) * l.quantity, 0);

  // 同一專案已付而未用的接送訂金（接送訂金單本身不可扣）
  const projectDeposits = type && type !== "deposit" ? match?.projects.find((p) => p.projectNo === projectNo)?.deposits || [] : [];
  const chosenCredit = projectDeposits.find((d) => d.id === creditId) || null;

  // D. 摘要（顯示用；實際金額由伺服器按 Shopify 價錢計算）
  const summary = (() => {
    const items: string[] = [];
    let total = 0;
    if (type === "cremation") {
      const v = plan?.variants.find((x) => x.id === variantId);
      if (v) { items.push(`${plan!.title}（${v.title}）`); total += price(v); }
      if (lines.length) { items.push(`加購 ${lines.length} 項`); total += linesTotal; }
    } else if (type === "deposit" && depositVariant) {
      items.push(`${depositVariant.p.title}${depositVariant.v.title !== "Default Title" ? `（${depositVariant.v.title}）` : ""}`);
      total += price(depositVariant.v);
    } else if (type === "vet") {
      items.push("上門獸醫評估");
      total += catalog.vet.base;
      for (const i of surcharges) { items.push(`附加費：${catalog.vet.surcharges[i]?.zh}`); total += catalog.vet.surcharges[i]?.price || 0; }
      if (lines.length) { items.push(`加購 ${lines.length} 項`); total += linesTotal; }
    } else if (type === "product") {
      if (lines.length) items.push(`${lines.reduce((n, l) => n + l.quantity, 0)} 件商品`);
      total += linesTotal;
    } else if (type === "other") {
      if (otherTitle) items.push(otherTitle);
      total += Number(otherAmount) || 0;
    }
    return { items, total };
  })();
  const creditAmount = chosenCredit ? Math.min(chosenCredit.amount, summary.total) : 0;

  const missing = [
    !name.trim() && "客人姓名",
    phone.replace(/\D/g, "").length < 8 && "電話",
    !type && "單類型",
    type === "cremation" && !variantId && "套餐及體重",
    type === "deposit" && !depositVariant && "訂金產品",
    type === "product" && !lines.length && "商品",
    type === "other" && !otherTitle.trim() && "項目名稱",
    type === "other" && !(Number(otherAmount) > 0) && "金額",
    intent === "received" && !method && "收款方式",
    needPet && !petName.trim() && "寵物姓名",
    needPet && !(Number(petWeight) > 0) && "體重",
    needPet && !petBreed.trim() && "品種",
    type === "deposit" && !address.trim() && "接送地址",
    type && type !== "deposit" && !urnPickup && "發票備註（骨灰取回）",
  ].filter(Boolean) as string[];

  function submit() {
    if (!type || missing.length) return;
    setError("");
    start(async () => {
      const res = await createOrder({
        clientToken,
        type,
        customer: { name, phone, email, referrerPhone: referrer },
        projectNo: projectNo === "new" ? "" : projectNo,
        petName,
        petType,
        ...(needPet ? { petWeight: Number(petWeight), petBreed, petGender, petAge } : {}),
        serviceDate,
        ...(type === "cremation" ? { ceremonyTime, urn: { type: urnType, pickupDate: urnPickupDate, remark: urnRemark } } : {}),
        serviceSlot: slot,
        ...(type === "deposit" && driver ? { driver } : {}),
        address,
        internalNote,
        publicNote,
        ...(type !== "deposit" && urnPickup ? { urnPickup } : {}),
        paymentIntent: intent,
        receivedMethod: method,
        ...(type === "cremation" ? { variantId, lines } : {}),
        ...(type === "deposit" ? { variantId: depositVariant?.v.id } : {}),
        ...(type === "product" ? { lines } : {}),
        ...(type === "vet" ? { vetSurcharges: surcharges, lines } : {}),
        ...(chosenCredit ? { depositCreditId: chosenCredit.id } : {}),
        ...(type === "other" ? { other: { title: otherTitle, amount: Number(otherAmount), description: otherDesc } } : {}),
      });
      if (res.error) return setError(res.error);
      if (res.id) router.push(`/new-order/${res.id}`);
    });
  }

  const showDate = type === "cremation" || type === "deposit" || type === "vet";
  const showAddress = type === "deposit" || type === "vet"; // 火化單的接送資料已在接送訂金單填寫

  return (
    <div className="space-y-4">
      {catalog.error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{catalog.error}</p>}

      <Section n="1" title="客人">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={label}>電話 *
            <div className="mt-1 flex gap-2">
              <input value={phone} onChange={(e) => { setPhone(e.target.value); setMatch(undefined); }} onBlur={lookup} inputMode="tel" placeholder="8 位香港電話" className={input} />
              <button type="button" onClick={lookup} className="shrink-0 rounded-lg border border-[var(--line)] bg-white px-3 text-sm hover:bg-[var(--cream)]">{looking ? "…" : "搜尋"}</button>
            </div>
          </label>
          <label className={label}>姓名 *<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input + " mt-1"} /></label>
          <label className={label}>電郵（選填）<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={input + " mt-1"} /></label>
        </div>
        {match === null && <p className="mt-2 text-xs text-[var(--soft)]">未有此電話的記錄，會建立新客人及新專案。</p>}
        {match && (
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
            <p className="text-[var(--soft)]">已有客人：<b className="text-[var(--ink)]">{match.name || "—"}</b>{match.pets.length ? ` · 寵物：${match.pets.join("、")}` : ""}</p>
            <p className="mt-2 text-xs text-[var(--soft)]">歸入哪個專案（同一專案共用同一單號，可累計及扣減訂金）</p>
            <div className="mt-1 space-y-1">
              {match.projects.map((p) => (
                <label key={p.projectNo} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="project" checked={projectNo === p.projectNo} onChange={() => setProjectNo(p.projectNo)} />
                  <span>單號 <b>{p.invoiceNo ?? "—"}</b> · {p.projectNo} · {p.labels.join("、")} · {p.lastDate}</span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="project" checked={!projectNo || projectNo === "new"} onChange={() => setProjectNo("new")} />
                <span>新專案（新單號）</span>
              </label>
            </div>
          </div>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-[var(--soft)]">推薦人（選填）</summary>
          <label className={label + " mt-2 sm:max-w-xs"}>推薦人電話<input value={referrer} onChange={(e) => setReferrer(e.target.value)} inputMode="tel" className={input + " mt-1"} /></label>
        </details>
      </Section>

      <Section n="2" title="單類型">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_TYPES.filter((x) => allowed.includes(x.key)).map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => chooseType(x.key)}
              aria-pressed={type === x.key}
              className={"rounded-xl border p-3 text-left transition " + (type === x.key ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--line)] bg-white hover:border-[var(--gold)]")}
            >
              <div className="text-xl">{x.icon}</div>
              <div className="mt-1 text-sm font-medium">{x.label}</div>
              <div className="mt-0.5 text-xs leading-5 text-[var(--soft)]">{x.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      {type && (
        <Section n="3" title={`${ORDER_TYPE_MAP[type].label}資料`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {type === "cremation" && (
              <>
                <label className={label}>套餐 *
                  <select value={planId} onChange={(e) => { setPlanId(e.target.value); setVariantId(""); }} className={input + " mt-1"}>
                    <option value="">請選擇</option>
                    {catalog.cremation.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </label>
                <label className={label}>寵物體重 *
                  <select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!plan} className={input + " mt-1 disabled:opacity-60"}>
                    <option value="">{plan ? "請選擇" : "請先選套餐"}</option>
                    {plan?.variants.map((v) => <option key={v.id} value={v.id}>{v.title} · {hk(price(v))}</option>)}
                  </select>
                </label>
              </>
            )}
            {type === "deposit" && (
              <label className={label}>訂金
                {depositVariants.length > 1 ? (
                  <select value={depositVariant?.v.id || ""} onChange={(e) => setVariantId(e.target.value)} className={input + " mt-1"}>
                    {depositVariants.map(({ p, v }) => <option key={v.id} value={v.id}>{p.title}{v.title !== "Default Title" ? `（${v.title}）` : ""} · {hk(price(v))}</option>)}
                  </select>
                ) : (
                  <div className={input + " mt-1 bg-[var(--cream)]"}>{depositVariant ? `${hk(price(depositVariant.v))}（Shopify 訂金產品）` : "Shopify 未有訂金產品"}</div>
                )}
              </label>
            )}
            {type === "vet" && (
              <div className={label}>評估費用
                <div className={input + " mt-1 bg-[var(--cream)]"}>{hk(catalog.vet.base)}（劃一收費）</div>
              </div>
            )}
            {type === "product" && <div className="sm:col-span-2"><LinePicker products={catalog.souvenir} lines={lines} onChange={setLines} /></div>}
            {type === "other" && (
              <>
                <label className={label}>項目名稱 *<input value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} maxLength={120} className={input + " mt-1"} /></label>
                <label className={label}>金額（HK$）*<input value={otherAmount} onChange={(e) => setOtherAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={input + " mt-1"} /></label>
                <label className={label + " sm:col-span-2"}>說明（會顯示在單據備註）<input value={otherDesc} onChange={(e) => setOtherDesc(e.target.value)} maxLength={500} className={input + " mt-1"} /></label>
              </>
            )}
            <label className={label}>{needPet ? "寵物姓名 *" : "寵物名稱"}<input value={petName} onChange={(e) => setPetName(e.target.value)} maxLength={100} className={input + " mt-1"} /></label>
            {needPet && <label className={label}>寵物種類<input value={petType} onChange={(e) => setPetType(e.target.value)} maxLength={80} placeholder="例如：貓、狗" className={input + " mt-1"} /></label>}
            {needPet && (
              <>
                <label className={label}>體重（公斤）*<input value={petWeight} onChange={(e) => setPetWeight(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={input + " mt-1"} /></label>
                <label className={label}>品種 *<input value={petBreed} onChange={(e) => setPetBreed(e.target.value)} maxLength={80} className={input + " mt-1"} /></label>
                <label className={label}>性別
                  <select value={petGender} onChange={(e) => setPetGender(e.target.value)} className={input + " mt-1"}>
                    <option value="">請選擇</option>
                    {PET_GENDERS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
                <label className={label}>年齡<input value={petAge} onChange={(e) => setPetAge(e.target.value)} maxLength={40} placeholder="例如：12 歲" className={input + " mt-1"} /></label>
              </>
            )}
            {showDate && (
              <label className={label}>{type === "deposit" ? "接送日期" : type === "cremation" ? "火化日期" : "服務日期"}<input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); if (type === "cremation") { const sg = suggestUrnPickup(urnPickupDate, e.target.value, urnType); if (sg) setUrnPickup(sg); } }} className={input + " mt-1"} /></label>
            )}
            {type === "cremation" && (
              <label className={label}>火化時間<div className="mt-1"><TimePicker value={ceremonyTime} onChange={setCeremonyTime} className={input} /></div></label>
            )}
            {type === "cremation" && (
              <>
                <div className={label + " sm:col-span-2"}>骨灰龕類別<div className="mt-1"><UrnPicker value={urnType} onChange={(v) => { setUrnType(v); const s = suggestUrnPickup(urnPickupDate, serviceDate, v); if (s) setUrnPickup(s); }} products={urnProducts} className={input} /></div></div>
                <div className={label}>骨灰龕取回日期<div className="mt-1"><DateOrPending value={urnPickupDate} onChange={(v) => { setUrnPickupDate(v); const s = suggestUrnPickup(v, serviceDate, urnType); if (s) setUrnPickup(s); }} className={input} /></div></div>
                <label className={label + " sm:col-span-2"}>骨灰龕備註<input value={urnRemark} onChange={(e) => setUrnRemark(e.target.value)} maxLength={500} className={input + " mt-1"} /></label>
              </>
            )}
            {showDate && type === "deposit" && (
              <label className={label}>接送時間<div className="mt-1"><TimePicker value={slot} onChange={setSlot} className={input} /></div></label>
            )}
            {showDate && type === "vet" && (
              <label className={label}>時段
                <select value={slot} onChange={(e) => setSlot(e.target.value)} className={input + " mt-1"}>
                  <option value="">待確認</option>
                  {catalog.slots.map((s) => <option key={s.zh} value={s.zh}>{s.label}</option>)}
                </select>
              </label>
            )}
            {type === "deposit" && (
              <label className={label}>司機
                <select value={driver} onChange={(e) => setDriver(e.target.value)} className={input + " mt-1"}>
                  <option value="">（未選擇）</option>
                  {drivers.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
            )}
            {showAddress && (
              <label className={label}>{type === "vet" ? "地區／地址" : `接送地址${type === "deposit" ? " *" : ""}`}<input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} className={input + " mt-1"} /></label>
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm">付款</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {PAYMENT_INTENTS.map((p) => (
                <label key={p.key} className={"flex cursor-pointer gap-2 rounded-xl border p-3 text-sm " + (intent === p.key ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--line)] bg-white")}>
                  <input type="radio" name="intent" checked={intent === p.key} onChange={() => setIntent(p.key)} className="mt-1" />
                  <span><b>{p.label}</b><span className="block text-xs text-[var(--soft)]">{p.hint}</span></span>
                </label>
              ))}
            </div>
            {intent === "received" && (
              <label className={label + " mt-2 sm:max-w-xs"}>收款方式 *
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={input + " mt-1"}>
                  <option value="">請選擇</option>
                  {RECEIVED_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            )}
            {projectDeposits.length > 0 && (
              <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                <div className="mb-1 font-medium">扣除接送訂金（同一專案）</div>
                <label className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name="credit" checked={!chosenCredit} onChange={() => setCreditId("")} />不扣除</label>
                {projectDeposits.map((d) => (
                  <label key={d.id} className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name="credit" checked={chosenCredit?.id === d.id} onChange={() => setCreditId(d.id)} />單號 {d.invoiceNo ?? "—"} · {hk(d.amount)} · 已付 {d.paidAt}{d.isTest ? "（測試）" : ""}</label>
                ))}
              </div>
            )}
            {type !== "deposit" && !projectDeposits.length && <p className="mt-2 text-xs text-[var(--soft)]">要先收訂金：另開一張「預約接送訂金」單（同一專案、同一單號）；客人已付訂金時，選擇該專案後可在此直接扣除。</p>}
          </div>

          <div className="mt-4 border-t border-[var(--line)] pt-3">
            <button type="button" onClick={() => setMore((v) => !v)} className="text-sm text-[var(--gold)]" aria-expanded={more}>{more ? "▾" : "▸"} 更多選項</button>
            {more && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {type === "cremation" && (
                  <div className="sm:col-span-2"><div className="mb-1 text-sm">加購紀念品</div><LinePicker products={catalog.souvenir} lines={lines} onChange={setLines} /></div>
                )}
                {type === "vet" && catalog.vet.surcharges.length > 0 && (
                  <div className="sm:col-span-2 text-sm">
                    <div className="mb-1">附加費</div>
                    {catalog.vet.surcharges.map((s, i) => (
                      <label key={i} className="mr-4 inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={surcharges.includes(i)} onChange={(e) => setSurcharges(e.target.checked ? [...surcharges, i] : surcharges.filter((x) => x !== i))} />
                        {s.zh}（+{hk(s.price)}）
                      </label>
                    ))}
                  </div>
                )}
                {type === "vet" && (
                  <div className="sm:col-span-2"><div className="mb-1 text-sm">加購紀念品</div><LinePicker products={catalog.souvenir} lines={lines} onChange={setLines} /></div>
                )}
                {type !== "deposit" && (
                  <fieldset className="sm:col-span-2">
                    <legend className="text-sm">發票備註：骨灰取回 *</legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {URN_PICKUP_OPTIONS.map((o) => (
                        <label key={o.key} className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm " + (urnPickup === o.key ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--line)] bg-white")}>
                          <input type="radio" name="urnPickup" checked={urnPickup === o.key} onChange={() => setUrnPickup(o.key)} />{o.label}
                        </label>
                      ))}
                    </div>
                    {urnPickup && (() => {
                      const preview = invoiceRemarkLines(urnPickup, type === "product" ? lines.length > 0 : (type === "cremation" || type === "vet") && lines.length > 0, type === "cremation" ? urnPickupDate : "");
                      return <p className="mt-1 text-xs text-[var(--soft)]">發票顯示：{preview.length ? preview.join(" ") : "（不加備註）"}{type === "product" || type === "cremation" || type === "vet" ? "　有紀念品時自動加「約 90 個工作天完成」。" : ""}</p>;
                    })()}
                  </fieldset>
                )}
                <label className={label}>對外備註（會顯示在 Shopify 單據）<input value={publicNote} onChange={(e) => setPublicNote(e.target.value)} maxLength={500} className={input + " mt-1"} /></label>
                <label className={label}>內部備註（只在後台）<input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={1000} className={input + " mt-1"} /></label>
                {!match && (
                  <label className={label}>專案編號（回訪客人）<input value={projectNo === "new" ? "" : projectNo} onChange={(e) => setProjectNo(e.target.value.toUpperCase())} maxLength={40} placeholder="新客人留空自動產生" className={input + " mt-1"} /></label>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {type && (
        <Section n="4" title="確認">
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
            <dt className="text-[var(--soft)]">客人</dt><dd>{name || "—"} · {phone || "—"}</dd>
            <dt className="text-[var(--soft)]">類型</dt><dd>{ORDER_TYPE_MAP[type].icon} {ORDER_TYPE_MAP[type].label}</dd>
            <dt className="text-[var(--soft)]">內容</dt><dd>{summary.items.join("、") || "—"}</dd>
            <dt className="text-[var(--soft)]">金額</dt><dd className="font-medium">{hk(summary.total)}{creditAmount > 0 && ` − 接送訂金 ${hk(creditAmount)} ＝ 應付 ${hk(summary.total - creditAmount)}`}</dd>
          </dl>
          {missing.length > 0 && <p className="mt-3 text-sm text-amber-700">尚欠：{missing.join("、")}</p>}
          {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={submit} disabled={pending || missing.length > 0} className="rounded-lg bg-[var(--gold)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {pending ? "建立中…" : "建立單據"}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
