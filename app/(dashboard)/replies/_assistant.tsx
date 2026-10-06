"use client";

import { useMemo, useState } from "react";
import { whatsappLink } from "@/lib/deposit-followup";
import {
  REPLY_CATEGORIES,
  detectCrisis,
  detectLang,
  fillTokens,
  greeting,
  type FillContext,
  type ReplyLang,
  type ReplyRecord,
  type ReplySnippet,
} from "@/lib/reply";
import type { PriceTokens } from "@/lib/site-content";

const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const panel = "rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5";
const btn = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

export function ReplyAssistant({
  snippets,
  records,
  staffName,
  siteUrl,
  prices,
  initialRef,
}: {
  snippets: ReplySnippet[];
  records: ReplyRecord[];
  staffName: string;
  siteUrl: string;
  prices: PriceTokens;
  initialRef: string;
}) {
  const initial = records.find((r) => r.ref === initialRef) || null;
  const [record, setRecord] = useState<ReplyRecord | null>(initial);
  const [query, setQuery] = useState("");
  const [ownerName, setOwnerName] = useState(initial?.owner_name || "");
  const [phone, setPhone] = useState(initial?.contact || "");
  const [message, setMessage] = useState("");
  const [lang, setLang] = useState<ReplyLang>(initial?.lang || "zh");
  const [langTouched, setLangTouched] = useState(false);
  const [withGreeting, setWithGreeting] = useState(true);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("全部");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const ctx: FillContext = { record, ownerName, staffName, siteUrl, lang, prices };
  const crisis = detectCrisis(message);
  const finalText = [withGreeting ? greeting(ctx) : "", body.trim()].filter(Boolean).join("\n");
  const unfilled = finalText.match(/\{(稱呼|毛孩|日期|時段|專案編號|同事|網站)\}/g);
  const wa = finalText && phone ? whatsappLink(phone, finalText) : null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return records
      .filter((r) => {
        const hay = [r.owner_name, r.pet_name, r.projectNo].join(" ").toLowerCase();
        return hay.includes(q) || (digits.length >= 4 && (r.contact || "").replace(/\D/g, "").includes(digits));
      })
      .slice(0, 8);
  }, [query, records]);

  const categories = useMemo(() => {
    const present = new Set(snippets.map((s) => s.category));
    return ["全部", ...REPLY_CATEGORIES.filter((c) => present.has(c)), ...[...present].filter((c) => !REPLY_CATEGORIES.includes(c))];
  }, [snippets]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snippets.filter(
      (s) => (category === "全部" || s.category === category) && (!q || `${s.title} ${s.zh} ${s.en}`.toLowerCase().includes(q))
    );
  }, [snippets, category, search]);

  function pick(r: ReplyRecord) {
    setRecord(r);
    setOwnerName(r.owner_name || "");
    setPhone(r.contact || "");
    if (!langTouched) setLang(r.lang);
    setQuery("");
  }

  function clearRecord() {
    setRecord(null);
    setOwnerName("");
    setPhone("");
  }

  function onMessage(text: string) {
    setMessage(text);
    const detected = detectLang(text);
    if (detected && !langTouched) setLang(detected);
  }

  function insert(s: ReplySnippet) {
    const raw = (lang === "en" ? s.en : s.zh) || s.zh || s.en;
    const text = fillTokens(raw, ctx);
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${text}` : text));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("複製回覆：", finalText);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* 左：客人及訊息 */}
      <div className="space-y-4">
        <section className={panel}>
          <h2 className="mb-3 text-base font-semibold">客人</h2>
          {record ? (
            <div className="rounded-xl bg-[var(--head)] px-3 py-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{record.owner_name || "—"} · {record.pet_name || "毛孩"}</div>
                  <div className="text-xs text-[var(--soft)]">
                    {record.kind} · {record.projectNo || "未有專案編號"} · 建立 {fmtDate(record.created_at)}
                    {record.service_date && <> · 預約 {record.service_date}</>}
                  </div>
                </div>
                <button type="button" onClick={clearRecord} className="shrink-0 text-xs text-[var(--soft)] hover:underline">更換</button>
              </div>
            </div>
          ) : (
            <div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋主人、毛孩、電話或專案編號" className={input} />
              {query.trim() && (
                <ul className="mt-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-white">
                  {matches.length === 0 && <li className="px-3 py-2 text-xs text-[var(--soft)]">找不到記錄，可直接在下方填寫稱呼及電話。</li>}
                  {matches.map((r) => (
                    <li key={r.ref}>
                      <button type="button" onClick={() => pick(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--cream)]">
                        <div>{r.owner_name || "—"} · {r.pet_name || "毛孩"}</div>
                        <div className="text-xs text-[var(--soft)]">{r.kind} · {r.projectNo || "未有專案編號"} · {r.contact || "—"} · {fmtDate(r.created_at)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">稱呼<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="例如：陳小姐" className={input + " mt-1"} /></label>
            <label className="text-sm">電話 / WhatsApp<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8 位香港電話" className={input + " mt-1"} /></label>
          </div>
        </section>

        <section className={panel}>
          <h2 className="mb-3 text-base font-semibold">客人訊息（可選）</h2>
          <textarea
            value={message}
            onChange={(e) => onMessage(e.target.value)}
            rows={6}
            placeholder="貼上客人的 WhatsApp 訊息：系統會檢查危機字眼，並按訊息自動選擇中文或英文回覆。"
            className={input + " leading-6"}
          />
          {crisis && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              <div className="font-semibold">⚠️ 客人訊息可能涉及情緒危機</div>
              <p className="mt-1">請由同事親自關心及跟進，切勿只用範本回覆。如有即時危險，請建議客人致電 <b>999</b>；撒瑪利亞防止自殺會 24 小時熱線 <b>2389 2222</b>。知識庫「情緒支援 → 危機關懷」可作開頭參考。</p>
            </div>
          )}
        </section>
      </div>

      {/* 右：回覆 */}
      <div className="space-y-4">
        <section className={panel}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">回覆內容</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={withGreeting} onChange={(e) => setWithGreeting(e.target.checked)} className="h-4 w-4 accent-[var(--gold)]" />
                開頭問候
              </label>
              <div className="flex items-center gap-1 text-xs" role="group" aria-label="回覆語言">
                {(["zh", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => {
                      setLang(l);
                      setLangTouched(true);
                    }}
                    className={"rounded-full border px-3 py-1 " + (lang === l ? "border-[var(--gold)] bg-[var(--gold)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--gold)]")}
                  >
                    {l === "zh" ? "中文" : "English"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {withGreeting && <div className="mb-2 rounded-lg bg-[var(--head)] px-3 py-2 text-sm text-[var(--soft)]">{greeting(ctx)}</div>}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder="在下方知識庫按「插入」，或直接輸入回覆。"
            className={input + " leading-6"}
          />
          {unfilled && (
            <p className="mt-1 text-xs text-amber-700">回覆中仍有未填資料：{[...new Set(unfilled)].join("、")}。請選擇客人記錄或手動修改。</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={btn + " text-green-700"}>💬 開啟 WhatsApp</a>
            ) : (
              <span className={btn + " cursor-not-allowed opacity-50"} title="請填寫電話及回覆內容">💬 開啟 WhatsApp</span>
            )}
            <button type="button" className={btn} disabled={!finalText} onClick={copy}>{copied ? "已複製 ✓" : "複製回覆"}</button>
            <button type="button" className={btn + " text-[var(--soft)]"} disabled={!body} onClick={() => setBody("")}>清除</button>
          </div>
          <p className="mt-2 text-xs text-[var(--soft)]">「開啟 WhatsApp」只會開啟預填訊息草稿，須由同事檢查後自行按傳送。</p>
        </section>

        <section className={panel}>
          <h2 className="mb-3 text-base font-semibold">回覆知識庫</h2>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={"rounded-full border px-3 py-1 text-xs " + (category === c ? "border-[var(--gold)] bg-[var(--gold)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--gold)]")}
              >
                {c}
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋知識庫，例如：訂金、骨灰、愉景灣" className={input} />
          <ul className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {shown.length === 0 && <li className="py-4 text-center text-sm text-[var(--soft)]">沒有符合的內容。</li>}
            {shown.map((s) => {
              const preview = (lang === "en" ? s.en : s.zh) || s.zh || s.en;
              return (
                <li key={s.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="text-xs text-[var(--soft)]">{s.category}</div>
                    </div>
                    <button type="button" onClick={() => insert(s)} className="shrink-0 rounded-md bg-[var(--gold)] px-2.5 py-1 text-xs text-white hover:opacity-90">插入</button>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-[var(--soft)]">{preview}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
