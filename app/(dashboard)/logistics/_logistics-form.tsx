"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOGISTICS_GROUPS } from "@/lib/logistics-fields";
import { updateCustomerData } from "./actions";

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";

// 客戶資料（Excel 欄位）：所有單號共用同一表格；未有客戶資料時保存即建立
export function LogisticsForm({ invoice, initial, exists, isAdmin }: { invoice: string; initial: Record<string, string>; exists: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateCustomerData(invoice, values);
      if (res.error) return setMsg({ ok: false, text: res.error });
      setMsg(res.warning ? { ok: false, text: `已保存。${res.warning}` } : { ok: true, text: "已保存。" });
      router.refresh();
    });
  }

  return (
    <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-lg font-semibold" aria-expanded={open}>
        {open ? "▾" : "▸"} 編輯客戶資料（Excel 欄位）{!exists && <span className="ml-2 text-sm font-normal text-[var(--soft)]">此單號未有客戶資料，保存後建立</span>}
      </button>
      {open && (
        <>
          {LOGISTICS_GROUPS.map((group) => {
            const fields = group.fields.filter((f) => !f.adminOnly || isAdmin);
            return (
              <div key={group.title} className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-[var(--soft)]">{group.title}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {fields.map((f) => (
                    <label key={f.key} className={"text-sm" + (f.type === "textarea" ? " sm:col-span-2 lg:col-span-4" : "")}>
                      {f.label}
                      {f.type === "textarea" ? (
                        <textarea value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} maxLength={2000} className={input} />
                      ) : (
                        <input
                          type={f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          value={values[f.key] || ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          maxLength={300}
                          className={input}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "保存中…" : "儲存修改"}</button>
            {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
