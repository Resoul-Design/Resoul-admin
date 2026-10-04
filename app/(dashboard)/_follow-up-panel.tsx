"use client";

import { useState, useTransition } from "react";
import { followLabel, followMessage, followNeedsLink, type FollowItem, type FollowUpKind, type FollowUpLang } from "@/lib/follow-up";
import { whatsappLink } from "@/lib/deposit-followup";
import { createFollowPaymentLink, markFollowUp } from "./_follow-up-actions";
import { useCloseRowActions } from "./_row-actions";
import { WHATSAPP_CONFIRM } from "./_testing-notice";

const btn = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

const KIND_CLASS: Record<FollowUpKind, string> = {
  paid_unscheduled: "bg-green-100 text-green-800",
  payment_failed: "bg-red-100 text-red-700",
  unpaid_next_day: "bg-amber-100 text-amber-800",
  reminded_unpaid: "bg-gray-200 text-gray-700",
};

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") : "—";
}

// 「操作」視窗內的跟進（火化服務、獸醫評估、紀念品訂單）：與接送服務的訂金跟進相同流程
export function FollowUpPanel({ item, kind, staffName }: { item: FollowItem; kind: FollowUpKind; staffName: string }) {
  const close = useCloseRowActions();
  const [link, setLink] = useState(item.mark.paymentLink || "");
  const [lang, setLang] = useState<FollowUpLang>(item.english ? "en" : "zh");
  const [text, setText] = useState(() => followMessage(item, kind, staffName, item.mark.paymentLink, item.english ? "en" : "zh") || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const payKind = followNeedsLink(item.entity, kind);
  const vet = item.entity === "vet";
  const wa = text ? whatsappLink(item.contact, text) : null;

  function run(action: () => Promise<{ error?: string; link?: string }>, closeAfter = false) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.link) {
        setLink(result.link);
        setText(followMessage(item, kind, staffName, result.link, lang) || "");
      }
      if (result.error) setError(result.error);
      else if (closeAfter) close();
    });
  }

  function switchLang(next: FollowUpLang) {
    if (next === lang) return;
    setLang(next);
    setText(followMessage(item, kind, staffName, link || null, next) || "");
  }

  function stop() {
    if (!window.confirm("確定不再跟進？之後不會再出現在跟進清單。")) return;
    run(() => markFollowUp(item.entity, item.ref, "closed"), true);
  }

  return (
    <div className="text-sm">
      <span className={"inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs " + KIND_CLASS[kind]}>🔔 {followLabel(item.entity, kind)}</span>
      <div className="mt-2 font-medium">{[item.owner || "—", item.pet].filter(Boolean).join(" · ")}</div>
      <div className="text-xs text-[var(--soft)]">
        {[item.projectNo || "未有專案編號", item.label, `建立 ${fmtTime(item.createdAt)}`].filter(Boolean).join(" · ")}
        {item.contact && <> · 📞 {item.contact}</>}
      </div>

      {kind === "reminded_unpaid" ? (
        <p className="mt-3 text-[var(--soft)]">
          已於 {fmtTime(item.mark.remindedAt)} {vet ? "聯絡" : "提醒"}（共 {item.mark.reminderCount || 1} 次），{vet ? "仍未有回覆" : "仍未付款"}。不再起草第二次訊息；建議致電問候客人，或標記「不再跟進」／於「編輯資料」改為已取消。
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
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => createFollowPaymentLink(item.entity, item.ref))}>
            {link ? "重新取得付款連結" : "產生付款連結"}
          </button>
        )}
        {kind !== "reminded_unpaid" && (
          wa && (!payKind || link) ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }} className={btn + " text-green-700"}>💬 開啟 WhatsApp</a>
          ) : (
            <span className={btn + " cursor-not-allowed opacity-50"}>💬 開啟 WhatsApp</span>
          )
        )}
        {kind === "reminded_unpaid" && item.contact && (
          <a href={`tel:${item.contact.replace(/[^\d+]/g, "")}`} className={btn}>📞 致電客人</a>
        )}
        {(payKind || (vet && kind === "unpaid_next_day")) && (
          <button type="button" className={btn} disabled={pending || (payKind && !link)} onClick={() => run(() => markFollowUp(item.entity, item.ref, "reminded"), true)}>
            {vet ? "標記已聯絡" : "標記已提醒"}
          </button>
        )}
        {kind === "paid_unscheduled" && (
          <button type="button" className={btn} disabled={pending} onClick={() => run(() => markFollowUp(item.entity, item.ref, "contacted"), true)}>標記已聯絡</button>
        )}
        <button type="button" className={btn + " text-[var(--soft)]"} disabled={pending} onClick={stop}>不再跟進</button>
      </div>
    </div>
  );
}
