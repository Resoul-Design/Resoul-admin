"use client";

import { useState } from "react";
import { updateDeposit } from "./actions";

export type DepositEditData = {
  id: string; owner_name: string | null; contact: string | null;
  pet_name: string | null; pet_type: string | null;
  service_date: string | null; service_time: string | null;
  pickup_address: string | null; notes: string | null; status: string;
};

const input = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--gold)]";
const field = "min-w-0 flex flex-col gap-1";
const statuses = [["new","新收到"],["contacted","已聯絡"],["scheduled","已排期"],["completed","已完成"],["cancelled","已取消"]];

export function EditDepositButton({ booking }: { booking: DepositEditData }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs hover:bg-[var(--cream)]">編輯</button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 px-4 py-8" onClick={() => setOpen(false)}>
      <div className="my-auto w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">編輯接送服務</h2><button type="button" onClick={() => setOpen(false)} aria-label="關閉">✕</button></div>
        <form action={updateDeposit} onSubmit={() => setOpen(false)} className="grid gap-3 text-sm sm:grid-cols-2">
          <input type="hidden" name="id" value={booking.id}/>
          <label className={field}>主人姓名<input name="owner_name" defaultValue={booking.owner_name || ""} className={input}/></label>
          <label className={field}>電話 / WhatsApp<input name="contact" defaultValue={booking.contact || ""} className={input}/></label>
          <label className={field}>毛孩名字<input name="pet_name" defaultValue={booking.pet_name || ""} className={input}/></label>
          <label className={field}>種類<input name="pet_type" defaultValue={booking.pet_type || ""} className={input}/></label>
          <label className={field}>預約日期<input type="date" name="service_date" defaultValue={booking.service_date || ""} className={input}/></label>
          <label className={field}>預約時段<select name="service_time" defaultValue={booking.service_time || ""} className={input}><option value="">待確認</option><option value="上午（09:00–12:00）">上午（09:00–12:00）</option><option value="下午（12:00–17:00）">下午（12:00–17:00）</option><option value="傍晚至晚上（17:00–21:00）">傍晚至晚上（17:00–21:00）</option><option value="Morning (09:00-12:00)">Morning (09:00-12:00)</option><option value="Afternoon (12:00-17:00)">Afternoon (12:00-17:00)</option><option value="Evening (17:00-21:00)">Evening (17:00-21:00)</option></select></label>
          <label className={field}>狀態<select name="status" defaultValue={booking.status} className={input}>{statuses.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className={field}>接送地址<input name="pickup_address" defaultValue={booking.pickup_address || ""} className={input}/></label>
          <label className={field + " sm:col-span-2"}>備註<textarea name="notes" rows={3} defaultValue={booking.notes || ""} className={input}/></label>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2">取消</button><button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-white">儲存</button></div>
        </form>
      </div>
    </div>}
  </>;
}
