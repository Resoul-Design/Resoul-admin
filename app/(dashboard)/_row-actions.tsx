"use client";

import { isBackdropPress } from "./_modal";
import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";

// 視窗內功能（跟進、編輯）完成後呼叫，以關閉整個操作視窗
const CloseCtx = createContext<() => void>(() => {});
export const useCloseRowActions = () => useContext(CloseCtx);

export type RowAction =
  | { kind: "panel"; key: string; label: string; title: string; alert?: boolean; node: ReactNode }
  | { kind: "link"; key: string; label: string; href: string; whatsapp?: boolean; confirm?: string };

const item = "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition";

// 功能分組：先揀範圍，再揀功能（跟進事項永遠放最頂，一按即達）
const GROUPS: { key: string; label: string; keys: string[] }[] = [
  { key: "status", label: "📋 狀態及服務", keys: ["status", "cremation", "create-cremation", "project"] },
  { key: "contact", label: "💬 聯絡及排期", keys: ["wa", "cal"] },
  { key: "pay", label: "💳 付款及單據", keys: ["paylink", "pay", "invoice", "invoice-pdf"] },
  { key: "data", label: "⚙️ 資料", keys: ["edit", "test"] },
];
const GROUP_MIN = 5; // 功能少於此數目時直接列出

function groupOf(key: string) {
  return GROUPS.find((g) => g.keys.includes(key))?.key || "data";
}

// 表格每行一個「操作」掣：按下開啟小視窗，列出跟進、日曆、發票、WhatsApp、編輯等功能
export function RowActions({ heading, sub, alertLabel, actions }: { heading: string; sub?: string; alertLabel?: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const panel = actions.find((a): a is Extract<RowAction, { kind: "panel" }> => a.kind === "panel" && a.key === view);

  const alerts = actions.filter((a) => a.kind === "panel" && a.alert);
  const rest = actions.filter((a) => !(a.kind === "panel" && a.alert));
  const grouped = rest.length >= GROUP_MIN;
  const groups = GROUPS.map((g) => ({ ...g, items: rest.filter((a) => groupOf(a.key) === g.key) })).filter((g) => g.items.length);
  const currentGroup = groups.find((g) => g.key === group);

  function close() {
    setOpen(false);
    setGroup(null);
    setView(null);
  }

  // 返回上一層：功能視窗 → 分組 → 第一層
  function back() {
    if (view) setView(null);
    else setGroup(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setGroup(null);
      setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openLink(e: MouseEvent<HTMLAnchorElement>, a: Extract<RowAction, { kind: "link" }>) {
    if (a.confirm && !window.confirm(a.confirm)) e.preventDefault();
  }

  function renderAction(a: RowAction) {
    return a.kind === "panel" ? (
      <button
        key={a.key}
        type="button"
        onClick={() => setView(a.key)}
        className={item + (a.alert ? " border-amber-300 bg-amber-50 font-medium text-amber-800 hover:bg-amber-100" : " border-[var(--line)] bg-white hover:border-[var(--gold)]")}
      >
        <span>{a.label}</span>
        <span className="text-[var(--soft)]">›</span>
      </button>
    ) : (
      <a
        key={a.key}
        href={a.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => openLink(e, a)}
        className={item + " border-[var(--line)] bg-white hover:border-[var(--gold)]" + (a.whatsapp ? " text-green-700" : "")}
      >
        <span>{a.label}</span>
        <span className="text-[var(--soft)]">↗</span>
      </a>
    );
  }

  const title = panel ? panel.title : currentGroup ? currentGroup.label : "操作";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={
          "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium " +
          (alertLabel ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--cream)]")
        }
      >
        {alertLabel ? `🔔 ${alertLabel}` : "操作"} ▾
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 px-4 py-8" onMouseDown={(e) => isBackdropPress(e) && close()}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={"my-auto w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 text-left sm:p-6 " + (panel ? "max-w-2xl" : "max-w-sm")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                {(panel || currentGroup) && (
                  <button type="button" onClick={back} className="mb-1 text-xs text-[var(--gold)] hover:underline">← 返回</button>
                )}
                <h2 className="text-lg font-semibold">{title}</h2>
                {!panel && <div className="mt-0.5 truncate text-xs text-[var(--soft)]">{[heading, sub].filter(Boolean).join(" · ")}</div>}
              </div>
              <button type="button" onClick={close} aria-label="關閉" className="text-[var(--soft)] hover:text-[var(--ink)]">✕</button>
            </div>
            <CloseCtx.Provider value={close}>
              {panel ? (
                panel.node
              ) : currentGroup ? (
                <div className="space-y-2">{currentGroup.items.map(renderAction)}</div>
              ) : grouped ? (
                <div className="space-y-2">
                  {alerts.map(renderAction)}
                  {groups.map((g) => (
                    <button key={g.key} type="button" onClick={() => setGroup(g.key)} className={item + " border-[var(--line)] bg-white hover:border-[var(--gold)]"}>
                      <span className="min-w-0">
                        <span className="block">{g.label}</span>
                        <span className="block truncate text-xs text-[var(--soft)]">{g.items.map((a) => a.label.replace(/^\S+\s/, "").replace(/（.*$/, "")).join("、")}</span>
                      </span>
                      <span className="text-[var(--soft)]">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">{actions.map(renderAction)}</div>
              )}
            </CloseCtx.Provider>
          </div>
        </div>
      )}
    </>
  );
}
