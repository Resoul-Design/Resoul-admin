"use client";

import { useState } from "react";
import { useCloseRowActions } from "../_row-actions";
import { updateBooking } from "./actions";
import { isRslProjectNo } from "@/lib/order-label";
import type { DraftCatalogProduct } from "@/lib/catalog";

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
  shopify_order_id: string | null;
  paid_at: string | null;
  notes: string | null;
};

const PLANS = ["風之旅", "雲之旅", "星之旅"];
const STATUSES: { key: string; label: string }[] = [
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "已接送" },
  { key: "cremating", label: "火化中" },
  { key: "ready", label: "可取回" },
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

const normWeight = (v: string) => v.replace(/\s+/g, "").replace(/[–—-]/g, "-").toLowerCase();
const priceText = (v: string | null) => (v == null || v === "" ? "" : String(Number(v)));

// 由備註讀取已揀的體重款式（「產品: 星之旅 Star Journey（1.1–5 kg）」或「體重: 1.1–5 kg」）
function weightFromNotes(notes: string | null) {
  const text = notes || "";
  return text.match(/產品[:：]\s*[^|｜]*?[（(]([^)）]*kg)[)）]/i)?.[1]?.trim() || text.match(/體重[:：]\s*([^|｜]+)/)?.[1]?.trim() || "";
}

// 操作視窗內的編輯表格；products＝Shopify 火化方案（只限火化預約），揀方案及體重後自動帶出收費
export function EditBookingInline({ booking, products = [], vetFee }: { booking: BookingData; products?: DraftCatalogProduct[]; vetFee?: number }) {
  const close = useCloseRowActions();
  const b = booking;
  const vet = String(b.source || "").includes("euthanasia");
  const projectNo = isRslProjectNo(b.case_no) ? b.case_no?.toUpperCase() : "";
  const paid = b.payment_status === "paid";
  const productOf = (name: string) => (name ? products.find((p) => p.title.includes(name)) : undefined);
  const [plan, setPlan] = useState(b.plan || "");
  const [variantId, setVariantId] = useState(() => {
    const weight = normWeight(weightFromNotes(b.notes));
    return (weight && productOf(b.plan || "")?.variants.find((v) => normWeight(v.title) === weight)?.id) || "";
  });
  const [amount, setAmount] = useState(b.payment_amount != null ? String(b.payment_amount) : "");
  const variants = productOf(plan)?.variants || [];

  function changePlan(next: string) {
    const oldTitle = variants.find((v) => v.id === variantId)?.title;
    setPlan(next);
    if (!next) return setVariantId("");
    // 轉方案：沿用同一體重並更新收費；未揀體重則清空收費，等同事揀選
    const same = productOf(next)?.variants.find((v) => v.title === oldTitle);
    setVariantId(same?.id || "");
    if (!paid) setAmount(same ? priceText(same.price) : "");
  }

  function changeWeight(id: string) {
    setVariantId(id);
    const v = variants.find((x) => x.id === id);
    if (v && !paid) setAmount(priceText(v.price));
  }

  return (
    <form
      action={updateBooking}
      onSubmit={(e) => {
        const status = (e.currentTarget.elements.namedItem("status") as HTMLSelectElement | null)?.value;
        if (status === "cancelled" && !confirm("確定將此預約標為「已取消」？")) {
          e.preventDefault();
          return;
        }
        close();
      }}
      className="grid sm:grid-cols-2 gap-3"
    >
      <input type="hidden" name="id" value={b.id} />

      <Field label="RSL 專案編號">
        <input name="case_no" defaultValue={projectNo} className={inputCls} placeholder="RSL-260922-AB12" pattern="RSL-[A-Za-z0-9]+-[A-Za-z0-9]+" title="請輸入 RSL 開頭的專案編號" />
      </Field>
      {/* 火化預約狀態由「更新進度」處理；獸醫評估仍在此更改狀態 */}
      {String(b.source || "").includes("euthanasia") && (
        <Field label="狀態">
          <select name="status" defaultValue={b.status} className={inputCls}>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      )}

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

      {!vet && <Field label="方案">
        <select name="plan" value={plan} onChange={(e) => changePlan(e.target.value)} className={inputCls}>
          <option value="">未定</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>}
      {!vet && products.length > 0 && (
        <Field label="寵物體重">
          <select name="variant_id" value={variantId} onChange={(e) => changeWeight(e.target.value)} disabled={!variants.length} className={inputCls + " disabled:opacity-60"}>
            <option value="">{variants.length ? "請選擇體重" : "請先選方案"}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}{v.price ? ` · HK$${Number(v.price).toLocaleString("en-US")}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      {vet ? (
        <Field label="評估費用（固定）">
          <input value={vetFee != null ? `HK$${vetFee.toLocaleString("en-US")}` : "—"} readOnly tabIndex={-1} className={inputCls + " bg-[var(--cream)] text-[var(--soft)]"} />
        </Field>
      ) : (
        <Field label="收費金額（HK$）">
          <input name="payment_amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} readOnly={paid} className={inputCls} placeholder="與客人確認後填寫" title={paid ? "已付款，不能修改金額" : ""} />
        </Field>
      )}
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
        <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-sm text-[var(--soft)] hover:bg-[var(--cream)]">
          取消
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
          儲存
        </button>
      </div>
    </form>
  );
}
