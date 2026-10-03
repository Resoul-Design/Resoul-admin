"use client";

import { WHATSAPP_CONFIRM } from "../_testing-notice";
import { useState, useTransition } from "react";
import {
  FOLLOW_UP_LABEL,
  followUpMessage,
  needsPaymentLink,
  preferredLang,
  whatsappLink,
  type FollowUpKind,
  type FollowUpLang,
  type FollowUpRow,
} from "@/lib/deposit-followup";
import { useCloseRowActions } from "../_row-actions";
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

// 跟進類別標籤（彈出視窗內使用）
function FollowUpBadge({ kind }: { kind: FollowUpKind }) {
  return <span className={"inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs " + KIND_CLASS[kind]}>🔔 {FOLLOW_UP_LABEL[kind]}</span>;
}

// 操作視窗內的訂金跟進：草擬訊息、產生付款連結、開啟 WhatsApp 及標記
export function FollowUpInline({ item, staffName }: { item: FollowUpItem; staffName: string }) {
  const close = useCloseRowActions();
  return <FollowUpPanel item={item} staffName={staffName} onDone={close} />;
}

function FollowUpPanel({ item, staffName, onDone }: { item: FollowUpItem; staffName: string; onDone: () => void }) {
  const [link, setLink] = useState(item.payment_link || "");
  const [lang, setLang] = useState<FollowUpLang>(() => preferredLang(item));
  const [text, setText] = useState(() => followUpMessage(item.kind, item, staffName, item.payment_link, lang) || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const payKind = needsPaymentLink(item.kind);
  const wa = text ? whatsappLink(item.contact, text) : null;

  // closeAfter：標記完成後關閉視窗（該行會從跟進清單消失）
  function run(action: () => Promise<{ error?: string; link?: string }>, closeAfter = false) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.link) {
        setLink(result.link);
        setText(followUpMessage(item.kind, item, staffName, result.link, lang) || "");
      }
      if (result.error) setError(result.error);
      else if (closeAfter) onDone();
    });
  }

  // 切換語言會按範本重寫草稿（已修改的內容不會保留）
  function switchLang(next: FollowUpLang) {
    if (next === lang) return;
    setLang(next);
    setText(followUpMessage(item.kind, item, staffName, link || null, next) || "");
  }

  function close() {
    if (!window.confirm("確定不再跟進此訂金？之後不會再出現在跟進清單。")) return;
    run(() => closeDepositFollowUp(item.id), true);
  }

  return (
    <div className="text-sm">
      <FollowUpBadge kind={item.kind} />
      <div className="mt-2 font-medium">{item.owner_name || "—"} · {item.pet_name || "毛孩"}</div>
      <div className="text-xs text-[var(--soft)]">
        {item.projectNo || "未有專案編號"} · 建立 {fmtTime(item.created_at)}
        {item.contact && <> · 📞 {item.contact}</>}
      </div>

      {item.kind === "reminded_unpaid" ? (
        <p className="mt-3 text-[var(--soft)]">
          已於 {fmtTime(item.reminded_at)} 提醒（共 {item.reminder_count || 1} 次），仍未付款。不再起草提醒；建議致電問候客人，或標記「不再跟進」／於「編輯」改為已取消。
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1 text-xs" role="group" aria-label="訊息語言">
            {(["zh", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchLang(l)}
                aria-pressed={lang === l}
                className={"rounded-full border px-3 py-1 " + (lang === l ? "border-[var(--gold)] bg-[var(--gold)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--gold)]")}
              >
                {l === "zh" ? "中文" : "English"}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 leading-6 outline-none focus:border-[var(--gold)]"
          />
          {payKind && !link && <p className="mt-1 text-xs text-amber-700">請先按「產生付款連結」，訊息會自動填入連結。</p>}
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {payKind && (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => createDepositPaymentLink(item.id))}>
            {link ? "重新取得付款連結" : "產生付款連結"}
          </button>
        )}
        {item.kind !== "reminded_unpaid" && (
          wa && (!payKind || link) ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }} className={btn + " text-green-700"}>💬 開啟 WhatsApp</a>
          ) : (
            <span className={btn + " cursor-not-allowed opacity-50"}>💬 開啟 WhatsApp</span>
          )
        )}
        {item.kind === "reminded_unpaid" && item.contact && (
          <a href={`tel:${item.contact.replace(/[^\d+]/g, "")}`} className={btn}>📞 致電客人</a>
        )}
        {payKind && (
          <button type="button" className={btn} disabled={pending || !link} onClick={() => run(() => markDepositReminded(item.id), true)}>標記已提醒</button>
        )}
        {item.kind === "paid_unscheduled" && (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => markDepositContacted(item.id), true)}>標記已聯絡</button>
        )}
        <button type="button" className={btn + " text-[var(--soft)]"} disabled={pending} onClick={close}>不再跟進</button>
      </div>
    </div>
  );
}
