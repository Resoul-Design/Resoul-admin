"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOGISTICS_GROUPS } from "@/lib/logistics-fields";
import { updateCustomerData } from "./actions";

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";

// 客戶資料（Excel 欄位）：所有單號共用同一表格；未有客戶資料時保存即建立。
// 分 6 組（主人及寵物、接送、火化、費用、骨灰盅、紀念品），預設收起，按組名展開；
// 收起的組別仍保留已修改的內容，最後按「儲存修改」一次過保存全部。
export function LogisticsForm({ invoice, initial, exists, isAdmin, autoKeys = [] }: { invoice: string; initial: Record<string, string>; exists: boolean; isAdmin: boolean; autoKeys?: string[] }) {
  const auto = new Set(autoKeys);
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const groups = LOGISTICS_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => (!f.adminOnly || isAdmin) && !f.hidden) }));
  const [closed, setClosed] = useState<Set<string>>(() => new Set(groups.map((g) => g.title)));
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const changed = (k: string) => (values[k] || "") !== (saved[k] || "");
  const changedCount = groups.reduce((n, g) => n + g.fields.filter((f) => changed(f.key)).length, 0);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateCustomerData(invoice, values);
      if (res.error) return setMsg({ ok: false, text: res.error });
      setSaved(values);
      setMsg(res.warning ? { ok: false, text: `已保存。${res.warning}` } : { ok: true, text: "已保存。" });
      router.refresh();
    });
  }
  const toggle = (t: string) => setClosed((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const allClosed = closed.size === groups.length;

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">編輯客戶資料（Excel 欄位）</h2>
        {!exists && <span className="text-sm text-[var(--soft)]">此單號未有客戶資料，保存後建立</span>}
        <button type="button" onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map((g) => g.title)))} className="ml-auto text-sm text-[var(--gold)] hover:underline">{allClosed ? "全部展開" : "全部收起"}</button>
      </div>
      <nav className="mb-3 flex flex-wrap gap-2" aria-label="客戶資料分組">
        {groups.map((g, i) => (
          <a key={g.title} href={`#lg-${i + 1}`} onClick={() => setClosed((s) => { const n = new Set(s); n.delete(g.title); return n; })} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs hover:border-[var(--gold)]">
            {i + 1}. {g.title}
          </a>
        ))}
      </nav>
      {autoKeys.length > 0 && <p className="mb-3 text-xs text-[var(--soft)]"><span className="mr-1 inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 align-middle" />淡黃色欄位按單據資料自動填入（{autoKeys.length} 項），請核對後按「儲存修改」保存。</p>}
      <div className="space-y-3">
        {groups.map((group, i) => {
          const open = !closed.has(group.title);
          const filled = group.fields.filter((f) => (values[f.key] || "").trim() !== "").length;
          const edited = group.fields.filter((f) => changed(f.key)).length;
          return (
            <div key={group.title} id={`lg-${i + 1}`} className="scroll-mt-20 rounded-2xl border border-[var(--line)] bg-white">
              <button type="button" onClick={() => toggle(group.title)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--gold)] text-xs font-semibold text-white">{i + 1}</span>
                <span className="font-semibold">{group.title}</span>
                <span className="text-xs text-[var(--soft)]">已填 {filled}／{group.fields.length}</span>
                {edited > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">已修改 {edited} 項</span>}
                <span className="ml-auto text-[var(--soft)]">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="grid gap-3 border-t border-[var(--line)] px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.fields.map((f) => (
                    <label key={f.key} className={"text-sm" + (f.type === "textarea" ? " sm:col-span-2 lg:col-span-4" : "")}>
                      {f.label}
                      {f.type === "textarea" ? (
                        <textarea value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} maxLength={2000} className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")} />
                      ) : (
                        <input
                          type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          value={values[f.key] || ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          maxLength={300}
                          className={input + (auto.has(f.key) && values[f.key] === initial[f.key] ? " !bg-amber-50" : "")}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--head)] px-4 py-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "保存中…" : "儲存修改"}</button>
        {changedCount > 0 && !pending && <span className="text-sm text-amber-800">共 {changedCount} 項未保存（包括已收起的組別）</span>}
        {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span>}
      </div>
    </section>
  );
}
