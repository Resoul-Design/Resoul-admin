"use client";

import { useCloseRowActions } from "../_row-actions";
import { findTimeSlot, TIME_SLOTS } from "@/lib/deposit-followup";
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

// 操作視窗內的編輯表格
export function EditDepositInline({ booking }: { booking: DepositEditData }) {
  const close = useCloseRowActions();
  return (
    <form action={updateDeposit} onSubmit={close} className="grid gap-3 text-sm sm:grid-cols-2">
      <input type="hidden" name="id" value={booking.id}/>
      <label className={field}>主人姓名<input name="owner_name" defaultValue={booking.owner_name || ""} className={input}/></label>
      <label className={field}>電話 / WhatsApp<input name="contact" defaultValue={booking.contact || ""} className={input}/></label>
      <label className={field}>毛孩名字<input name="pet_name" defaultValue={booking.pet_name || ""} className={input}/></label>
      <label className={field}>種類<input name="pet_type" defaultValue={booking.pet_type || ""} className={input}/></label>
      <label className={field}>預約日期<input type="date" name="service_date" defaultValue={booking.service_date || ""} className={input}/></label>
      <label className={field}>預約時段<select name="service_time" defaultValue={findTimeSlot(booking.service_time)?.zh ?? (booking.service_time || "")} className={input}><option value="">待確認</option>{TIME_SLOTS.map((slot) => <option key={slot.zh} value={slot.zh}>{slot.label}</option>)}{booking.service_time && !findTimeSlot(booking.service_time) && <option value={booking.service_time}>{booking.service_time}</option>}</select></label>
      <label className={field}>狀態<select name="status" defaultValue={booking.status} className={input}>{statuses.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className={field}>接送地址<input name="pickup_address" defaultValue={booking.pickup_address || ""} className={input}/></label>
      <label className={field + " sm:col-span-2"}>備註<textarea name="notes" rows={3} defaultValue={booking.notes || ""} className={input}/></label>
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={close} className="px-4 py-2">取消</button><button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-white">儲存</button></div>
    </form>
  );
}
