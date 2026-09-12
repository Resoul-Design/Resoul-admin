"use client";

import { useState } from "react";
import { updateBooking } from "./actions";

export type BookingData = {
  id: string;
  case_no: string | null;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  pet_type: string | null;
  plan: string | null;
  service_date: string | null;
  service_time: string | null;
  pickup_address: string | null;
  status: string;
  source: string | null;
  payment_ref: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  payment_currency: string | null;
  shopify_order_name: string | null;
  paid_at: string | null;
  notes: string | null;
};

const PLANS = ["風之旅", "雲之旅", "星之旅"];
const STATUSES: { key: string; label: string }[] = [
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "接送中" },
  { key: "cremating", label: "火化中" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"text-sm " + (full ? "sm:col-span-2" : "")}>
      <span className="block text-[var(--soft)] mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]";

export function EditBookingButton({ booking }: { booking: BookingData }) {
  const [open, setOpen] = useState(false);
  const b = booking;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]"
      >
        編輯
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4 py-8 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-6 w-full max-w-lg my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">編輯預約</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--soft)] hover:text-[var(--ink)]"
              >
                ✕
              </button>
            </div>

            <form
              action={updateBooking}
              onSubmit={() => setOpen(false)}
              className="grid sm:grid-cols-2 gap-3"
            >
              <input type="hidden" name="id" value={b.id} />

              <Field label="專案編號">
                <input name="case_no" defaultValue={b.case_no || ""} className={inputCls} placeholder="留空自動產生" />
              </Field>
              <Field label="狀態">
                <select name="status" defaultValue={b.status} className={inputCls}>
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="主人姓名">
                <input name="owner_name" defaultValue={b.owner_name || ""} className={inputCls} />
              </Field>
              <Field label="電話 / 聯絡">
                <input name="contact" defaultValue={b.contact || ""} className={inputCls} />
              </Field>

              <Field label="毛孩名">
                <input name="pet_name" defaultValue={b.pet_name || ""} className={inputCls} />
              </Field>
              <Field label="種類">
                <input name="pet_type" defaultValue={b.pet_type || ""} className={inputCls} />
              </Field>

              <Field label="方案">
                <select name="plan" defaultValue={b.plan || ""} className={inputCls}>
                  <option value="">未定</option>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="接送地址">
                <input name="pickup_address" defaultValue={b.pickup_address || ""} className={inputCls} />
              </Field>

              <Field label="服務日期">
                <input type="date" name="service_date" defaultValue={b.service_date || ""} className={inputCls} />
              </Field>
              <Field label="服務時間">
                <input type="time" name="service_time" defaultValue={b.service_time ? b.service_time.slice(0, 5) : ""} className={inputCls} />
              </Field>

              <Field label="備註" full>
                <textarea name="notes" defaultValue={b.notes || ""} rows={3} className={inputCls + " resize-y"} placeholder="預約要求 / 內部備註…" />
              </Field>

              <div className="sm:col-span-2 flex justify-end gap-2 mt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--soft)] hover:bg-[var(--cream)]">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
                  儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
