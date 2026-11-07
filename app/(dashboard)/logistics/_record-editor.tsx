"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateServiceRecord, type RecordKind, type RecordValues } from "./_record-actions";

const input = "mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm";

// 編輯一筆服務記錄；保存後同步 Shopify 訂單或付款連結（主人、電話、寵物）
export function RecordEditor({ kind, id, title, initial }: { kind: RecordKind; id: string; title: string; initial: RecordValues }) {
  const router = useRouter();
  const [values, setValues] = useState<RecordValues>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof RecordValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const service = kind !== "company";

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateServiceRecord(kind, id, values);
      if (res.error) return setMsg({ kind: "err", text: res.error });
      setMsg(res.warning ? { kind: "warn", text: res.warning } : { kind: "ok", text: "已保存並同步 Shopify。" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">主人姓名 *<input value={values.owner_name || ""} onChange={set("owner_name")} maxLength={100} className={input} /></label>
        <label className="text-sm">聯絡電話 *<input value={values.contact || ""} onChange={set("contact")} maxLength={40} className={input} /></label>
        {!service && <label className="text-sm">電郵<input type="email" value={values.email || ""} onChange={set("email")} maxLength={254} className={input} /></label>}
        <label className="text-sm">寵物名稱<input value={values.pet_name || ""} onChange={set("pet_name")} maxLength={100} className={input} /></label>
        {service && <label className="text-sm">寵物種類<input value={values.pet_type || ""} onChange={set("pet_type")} maxLength={80} className={input} /></label>}
        {service && <label className="text-sm">服務日期<input type="date" value={values.service_date || ""} onChange={set("service_date")} className={input} /></label>}
        {service && <label className="text-sm">時段<input value={values.service_time || ""} onChange={set("service_time")} maxLength={60} className={input} /></label>}
        {service && <label className="text-sm sm:col-span-2 lg:col-span-3">地址<input value={values.pickup_address || ""} onChange={set("pickup_address")} maxLength={300} className={input} /></label>}
        {service && <label className="text-sm sm:col-span-2 lg:col-span-3">備註<textarea value={values.notes || ""} onChange={set("notes")} maxLength={4000} rows={3} className={input} /></label>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50">{pending ? "保存中…" : "保存並同步 Shopify"}</button>
        {msg && <span role="status" className={"text-sm " + (msg.kind === "err" ? "text-red-700" : msg.kind === "warn" ? "text-amber-700" : "text-green-700")}>{msg.text}</span>}
      </div>
    </div>
  );
}
