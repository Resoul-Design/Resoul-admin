"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PROGRESS_STAGES, readyMessage, type ProgressData } from "@/lib/booking-progress";
import { advanceProgress, undoProgress } from "./bookings/_progress-actions";
import { WHATSAPP_CONFIRM, whatsappHref } from "./bookings/_whatsapp";
import { advanceDepositStep, cancelService, pickupFromDeposit, restoreService, scheduleCremation, undoDepositStep, unscheduleCremation } from "./_service-actions";

const btn = "rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs hover:border-[var(--gold)] disabled:opacity-50";

function fmt(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
}

type StepKey = "received" | "contacted" | "scheduled" | "picked_up" | "cremating" | "ready" | "returned";

type Props = {
  entity: "deposit" | "cremation";
  id: string; // 接送服務或火化預約本身
  status: string; // 本身的狀態
  createdAt: string;
  cremationId: string | null; // 接送服務：已連結的火化預約；火化預約：等於 id
  progress: ProgressData | null; // 火化進度（未有火化預約時為 null）
  scheduledText: string;
  owner: string;
  petName: string;
  contact: string;
  english: boolean;
  staffName: string;
};

// 一條進度線：新收到 → 已聯絡 → 已排期 → 已接送 → 火化中 → 可取回 → 已交還（火化預約不設「已聯絡」）
export function ServiceProgress(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [returnedTo, setReturnedTo] = useState(p.owner);
  const [lang, setLang] = useState<"zh" | "en">(p.english ? "en" : "zh");
  const [text, setText] = useState(() => readyMessage(p.english ? "en" : "zh", p.owner, p.petName, p.staffName));

  const cancelled = p.status === "cancelled";
  const prog = p.progress;
  const stageDates = PROGRESS_STAGES.map((s) => (prog ? (prog[s.column as keyof ProgressData] as string | null) : null));
  const stagesDone = stageDates.findIndex((v) => !v) === -1 ? PROGRESS_STAGES.length : stageDates.findIndex((v) => !v);
  const afterPickup = stagesDone > 0;
  const isDeposit = p.entity === "deposit";
  const contactedDone = afterPickup || ["contacted", "scheduled", "completed"].includes(p.status);
  const scheduledDone = afterPickup || (isDeposit ? ["scheduled", "completed"].includes(p.status) : !["new", "cancelled"].includes(p.status));

  const steps: { key: StepKey; label: string; done: boolean; detail?: string }[] = [
    { key: "received", label: "新收到", done: true, detail: fmt(p.createdAt) },
    ...(isDeposit ? [{ key: "contacted" as StepKey, label: "已聯絡", done: contactedDone }] : []),
    { key: "scheduled", label: "已排期", done: scheduledDone, detail: p.scheduledText },
    ...PROGRESS_STAGES.map((s, i) => ({
      key: s.key as StepKey,
      label: s.label,
      done: i < stagesDone,
      detail: [fmt(stageDates[i]), s.key === "returned" && prog?.returned_to ? `簽收人：${prog.returned_to}` : ""].filter(Boolean).join(" · "),
    })),
  ];
  const nextIndex = steps.findIndex((s) => !s.done);
  const next = nextIndex >= 0 ? steps[nextIndex] : null;
  const last = [...steps].reverse().find((s) => s.done && s.key !== "received");
  const isReady = stagesDone === 3; // 可取回、未交還
  const wa = whatsappHref(p.contact, text);

  function run(action: () => Promise<{ error?: string }>) {
    setError("");
    start(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function advance() {
    if (!next) return;
    if (next.key === "returned" && !window.confirm(`確認骨灰已由「${returnedTo.trim()}」取回？`)) return;
    if (next.key === "picked_up" && isDeposit && !p.cremationId && !window.confirm("標記已接送會以同一專案編號建立火化預約（方案及收費待確認），之後的進度在火化預約更新。繼續？")) return;
    const cid = p.cremationId;
    if (next.key === "contacted") return run(() => advanceDepositStep(p.id, "contacted"));
    if (next.key === "scheduled") return run(() => (isDeposit ? advanceDepositStep(p.id, "scheduled") : scheduleCremation(p.id)));
    if (next.key === "picked_up") return run(() => (isDeposit ? pickupFromDeposit(p.id, cid) : advanceProgress(p.id, "picked_up")));
    if (!cid) return setError("未有連結的火化預約。");
    run(() => advanceProgress(cid, next.key as "cremating" | "ready" | "returned", returnedTo));
  }

  function undo() {
    if (!last || !window.confirm(`撤回「${last.label}」？`)) return;
    if (isDeposit) return run(() => undoDepositStep(p.id, p.cremationId));
    if (afterPickup) return run(() => undoProgress(p.id));
    run(() => unscheduleCremation(p.id));
  }

  return (
    <div className="text-sm">
      <div className="font-medium">{[p.owner, p.petName].filter(Boolean).join(" · ") || "—"}</div>

      <ol className="mt-4">
        {steps.map((s, i) => (
          <Step key={s.key} label={s.label} done={s.done} current={i === nextIndex && !cancelled} detail={s.detail} last={i === steps.length - 1} />
        ))}
      </ol>

      {error && <p className="mt-3 text-xs text-red-700" role="alert">{error}</p>}

      {cancelled ? (
        <div className="mt-4 rounded-xl bg-[var(--head)] p-3">
          <p className="text-[var(--soft)]">此預約已取消。</p>
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("恢復此預約為「新收到」？")) run(() => restoreService(p.entity, p.id)); }} className={btn + " mt-2"}>恢復預約</button>
        </div>
      ) : next ? (
        <div className="mt-4 rounded-xl bg-[var(--head)] p-3">
          {next.key === "returned" && (
            <label className="mb-2 block text-xs text-[var(--soft)]">
              簽收人
              <input value={returnedTo} onChange={(e) => setReturnedTo(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]" />
            </label>
          )}
          <button
            type="button"
            disabled={pending || (next.key === "returned" && !returnedTo.trim())}
            onClick={advance}
            className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "更新中…" : `下一步：${next.label}`}
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
                <button key={l} type="button" onClick={() => { setLang(l); setText(readyMessage(l, p.owner, p.petName, p.staffName)); }} aria-pressed={lang === l}
                  className={"rounded-full border px-3 py-1 " + (lang === l ? "border-[var(--gold)] bg-[var(--gold)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--gold)]")}>
                  {l === "zh" ? "中文" : "English"}
                </button>
              ))}
            </div>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 leading-6 outline-none focus:border-[var(--gold)]" />
          <div className="mt-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (WHATSAPP_CONFIRM && !window.confirm(WHATSAPP_CONFIRM)) e.preventDefault(); }} className={btn + " inline-block text-green-700"}>💬 開啟 WhatsApp 通知</a>
            ) : (
              <span className="text-xs text-[var(--soft)]">未有有效電話，請以其他方式通知客人。</span>
            )}
          </div>
        </div>
      )}

      {!cancelled && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--soft)]">
          {last && <button type="button" disabled={pending} onClick={undo} className="underline-offset-2 hover:underline">撤回上一步</button>}
          {!afterPickup && <button type="button" disabled={pending} onClick={() => { if (window.confirm("確定取消此預約？")) run(() => cancelService(p.entity, p.id)); }} className="text-red-700 underline-offset-2 hover:underline">取消預約</button>}
        </div>
      )}
    </div>
  );
}

function Step({ label, done, current = false, detail, last = false }: { label: string; done: boolean; current?: boolean; detail?: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && <span className="absolute left-[9px] top-5 h-full w-px bg-[var(--line)]" aria-hidden />}
      <span className={"relative z-[1] mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border text-[11px] " + (done ? "border-[var(--gold)] bg-[var(--gold)] text-white" : current ? "border-[var(--gold)] bg-white" : "border-[var(--line)] bg-white")} aria-hidden>
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
