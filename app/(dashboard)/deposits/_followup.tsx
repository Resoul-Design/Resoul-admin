"use client";

import { useState, useTransition } from "react";
import {
  FOLLOW_UP_LABEL,
  followUpMessage,
  needsPaymentLink,
  whatsappLink,
  type FollowUpKind,
  type FollowUpRow,
} from "@/lib/deposit-followup";
import { closeDepositFollowUp, createDepositPaymentLink, markDepositContacted, markDepositReminded } from "./actions";

export type FollowUpItem = FollowUpRow & { kind: FollowUpKind; projectNo: string };

const KIND_CLASS: Record<FollowUpKind, string> = {
  paid_unscheduled: "bg-green-100 text-green-800",
  payment_failed: "bg-red-100 text-red-700",
  unpaid_next_day: "bg-amber-100 text-amber-800",
  reminded_unpaid: "bg-gray-200 text-gray-700",
};

const btn = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

function fmtTime(iso?: string | null) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

function FollowUpCard({ item, staffName }: { item: FollowUpItem; staffName: string }) {
  const [link, setLink] = useState(item.payment_link || "");
  const [text, setText] = useState(() => followUpMessage(item.kind, item, staffName, item.payment_link) || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const payKind = needsPaymentLink(item.kind);
  const wa = text ? whatsappLink(item.contact, text) : null;

  function run(action: () => Promise<{ error?: string; link?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.link) {
        setLink(result.link);
        setText(followUpMessage(item.kind, item, staffName, result.link) || "");
      }
      if (result.error) setError(result.error);
    });
  }

  function close() {
    if (!window.confirm("確定不再跟進此訂金？之後不會再出現在跟進清單。")) return;
    run(() => closeDepositFollowUp(item.id));
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={"inline-block rounded-full px-2 py-0.5 text-xs " + KIND_CLASS[item.kind]}>{FOLLOW_UP_LABEL[item.kind]}</span>
          <div className="mt-1.5 font-medium">{item.owner_name || "—"} · {item.pet_name || "毛孩"}</div>
          <div className="text-xs text-[var(--soft)]">
            {item.projectNo || "未有專案編號"} · 建立 {fmtTime(item.created_at)}
            {item.contact && <> · 📞 {item.contact}</>}
          </div>
        </div>
      </div>

      {item.kind === "reminded_unpaid" ? (
        <p className="mt-3 text-sm text-[var(--soft)]">
          已於 {fmtTime(item.reminded_at)} 提醒（共 {item.reminder_count || 1} 次），仍未付款。不再起草提醒；建議致電問候客人，或標記「不再跟進」／於「編輯」改為已取消。
        </p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="mt-3 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--gold)]"
          />
          {payKind && !link && <p className="mt-1 text-xs text-amber-700">請先按「產生付款連結」，訊息會自動填入連結。</p>}
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {payKind && (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => createDepositPaymentLink(item.id))}>
            {link ? "重新取得付款連結" : "產生付款連結"}
          </button>
        )}
        {item.kind !== "reminded_unpaid" && (
          wa && (!payKind || link) ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={btn + " text-green-700"}>💬 開啟 WhatsApp</a>
          ) : (
            <span className={btn + " cursor-not-allowed opacity-50"}>💬 開啟 WhatsApp</span>
          )
        )}
        {item.kind === "reminded_unpaid" && item.contact && (
          <a href={`tel:${item.contact.replace(/[^\d+]/g, "")}`} className={btn}>📞 致電客人</a>
        )}
        {payKind && (
          <button type="button" className={btn} disabled={pending || !link} onClick={() => run(() => markDepositReminded(item.id))}>標記已提醒</button>
        )}
        {item.kind === "paid_unscheduled" && (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => markDepositContacted(item.id))}>標記已聯絡</button>
        )}
        <button type="button" className={btn + " text-[var(--soft)]"} disabled={pending} onClick={close}>不再跟進</button>
      </div>
    </div>
  );
}

export function DepositFollowUp({ items, staffName, notReady }: { items: FollowUpItem[]; staffName: string; notReady: boolean }) {
  return (
    <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-4 sm:p-5">
      <h2 className="text-lg font-semibold">今日要跟進（{notReady ? "—" : items.length}）</h2>
      {notReady ? (
        <p className="mt-2 text-sm text-amber-800">未啟用訂金跟進：請先於 Supabase（diyxcx）執行 <code>db/migration_deposit_followup.sql</code>。</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--soft)]">暫時沒有需要跟進的訂金。</p>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {items.map((item) => <FollowUpCard key={item.id} item={item} staffName={staffName} />)}
        </div>
      )}
    </section>
  );
}
