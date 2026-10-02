"use client";

import { useState, useTransition } from "react";
import { PROGRESS_STAGES, readyMessage, type ProgressData } from "@/lib/booking-progress";
import { advanceProgress, undoProgress } from "./_progress-actions";
import { WHATSAPP_CONFIRM, whatsappHref } from "./_whatsapp";

const btn = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

function fmt(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
}

type Props = {
  id: string;
  owner: string;
  petName: string;
  contact: string;
  status: string;
  scheduledText: string;
  english: boolean;
  staffName: string;
  progress: ProgressData | null;
};

// 「操作」視窗內的火化進度：時間線、標記下一步、可取回 WhatsApp 通知、撤回
export function ProgressInline({ id, owner, petName, contact, status, scheduledText, english, staffName, progress }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [returnedTo, setReturnedTo] = useState(owner);
  const [lang, setLang] = useState<"zh" | "en">(english ? "en" : "zh");
  const [text, setText] = useState(() => readyMessage(english ? "en" : "zh", owner, petName, staffName));

  if (!progress) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        未啟用進度追蹤：請先於 Supabase（diyxcx）執行 <code>db/migration_cremation_progress.sql</code>。
      </div>
    );
  }

  const values = PROGRESS_STAGES.map((s) => progress[s.column as keyof ProgressData] as string | null);
  const done = values.findIndex((v) => !v) === -1 ? PROGRESS_STAGES.length : values.findIndex((v) => !v);
  const next = PROGRESS_STAGES[done];
  const cancelled = status === "cancelled";
  const isReady = done === 3; // 已標記可取回、未交還
  const wa = whatsappHref(contact, text);

  function run(action: () => Promise<{ error?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function switchLang(l: "zh" | "en") {
    setLang(l);
    setText(readyMessage(l, owner, petName, staffName));
  }

  return (
    <div className="text-sm">
      <div className="font-medium">{[owner, petName].filter(Boolean).join(" · ") || "—"}</div>

      <ol className="mt-4 space-y-0">
        <Step label="已排期" done={status !== "new" || !!scheduledText || done > 0} detail={scheduledText} />
        {PROGRESS_STAGES.map((s, i) => (
          <Step
            key={s.key}
            label={s.label}
            done={i < done}
            current={i === done && !cancelled}
            detail={[fmt(values[i]), s.key === "returned" && progress.returned_to ? `簽收人：${progress.returned_to}` : ""].filter(Boolean).join(" · ")}
            last={i === PROGRESS_STAGES.length - 1}
          />
        ))}
      </ol>

      {error && <p className="mt-3 text-xs text-red-700" role="alert">{error}</p>}

      {cancelled ? (
        <p className="mt-4 text-[var(--soft)]">此預約已取消，不能更新進度。</p>
      ) : next ? (
        <div className="mt-4 rounded-xl bg-[var(--head)] p-3">
          {next.key === "returned" && (
            <label className="mb-2 block text-xs text-[var(--soft)]">
              簽收人
              <input
                value={returnedTo}
                onChange={(e) => setReturnedTo(e.target.value)}
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
              />
            </label>
          )}
          <button
            type="button"
            disabled={pending || (next.key === "returned" && !returnedTo.trim())}
            onClick={() => {
              if (next.key === "returned" && !window.confirm(`確認骨灰已由「${returnedTo.trim()}」取回？`)) return;
              run(() => advanceProgress(id, next.key, returnedTo));
            }}
            className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "更新中…" : `標記為「${next.label}」`}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-green-700">骨灰已交還，整個流程已完成。</p>
      )}

      {isReady && !cancelled && (
        <div className="mt-4 rounded-xl border border-[var(--line)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium">通知客人可取回</span>
            <div className="flex gap-1 text-xs" role="group" aria-label="訊息語言">
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
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 leading-6 outline-none focus:border-[var(--gold)]"
          />
          <div className="mt-2">
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }}
                className={btn + " inline-block text-green-700"}
              >
                💬 開啟 WhatsApp 通知
              </a>
            ) : (
              <span className="text-xs text-[var(--soft)]">未有有效電話，請以其他方式通知客人。</span>
            )}
          </div>
        </div>
      )}

      {done > 0 && !cancelled && (
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (window.confirm(`撤回「${PROGRESS_STAGES[done - 1].label}」？`)) run(() => undoProgress(id)); }}
          className="mt-4 text-xs text-[var(--soft)] underline-offset-2 hover:underline"
        >
          撤回上一步
        </button>
      )}
    </div>
  );
}

function Step({ label, done, current = false, detail, last = false }: { label: string; done: boolean; current?: boolean; detail?: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && <span className="absolute left-[9px] top-5 h-full w-px bg-[var(--line)]" aria-hidden />}
      <span
        className={
          "relative z-[1] mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border text-[11px] " +
          (done ? "border-[var(--gold)] bg-[var(--gold)] text-white" : current ? "border-[var(--gold)] bg-white" : "border-[var(--line)] bg-white")
        }
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <div className={done ? "font-medium" : current ? "font-medium text-[var(--gold)]" : "text-[var(--soft)]"}>
          {label}
          {current && <span className="ml-2 text-xs font-normal text-[var(--soft)]">下一步</span>}
        </div>
        {detail && <div className="text-xs text-[var(--soft)]">{detail}</div>}
      </div>
    </li>
  );
}
