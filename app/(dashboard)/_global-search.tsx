"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchGroup } from "./_search-actions";

// 全後台搜尋：頁頂按鈕（或按「/」）開啟，輸入電話、名字、專案編號、付款參考或訂單號
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // 結果連同對應的關鍵字一併保存；關鍵字未對上即代表仍在搜尋
  const [result, setResult] = useState<{ term: string; groups: SearchGroup[] }>({ term: "", groups: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const term = q.trim();
  const ready = term.length >= 2;
  const loading = ready && result.term !== term;
  const groups = ready && !loading ? result.groups : [];
  const items = groups.flatMap((g) => g.items);

  // 「/」開啟（正在輸入其他欄位時不觸發）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // 輸入停頓 250ms 後搜尋；只採用最新一次的結果
  useEffect(() => {
    if (!ready) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      let groups: SearchGroup[] = [];
      try {
        groups = await globalSearch(term);
      } catch {
        groups = [];
      }
      if (id === seq.current) {
        setResult({ term, groups });
        setActive(0);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term, ready]);

  function close() {
    setOpen(false);
    setQ("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active].href);
    }
  }

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="搜尋"
        title="搜尋（按 / 鍵）"
        className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--soft)] hover:border-[var(--gold)]"
      >
        <span aria-hidden>🔍</span>
        <span className="hidden xl:inline">搜尋</span>
        <kbd className="hidden rounded border border-[var(--line)] px-1 text-[10px] xl:inline">/</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 px-3 pt-[10vh]" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="全後台搜尋"
            className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4">
              <span aria-hidden className="text-[var(--soft)]">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="電話、主人／毛孩名、RSL 專案編號、PAY 付款參考、訂單號…"
                className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none"
                aria-label="搜尋關鍵字"
              />
              {loading && <span className="text-xs text-[var(--soft)]">搜尋中…</span>}
              <button type="button" onClick={close} aria-label="關閉" className="text-[var(--soft)] hover:text-[var(--ink)]">✕</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2 text-sm">
              {!ready ? (
                <p className="px-4 py-3 text-[var(--soft)]">輸入最少 2 個字。可搜尋接送服務、火化預約、獸醫評估及紀念品訂單（只限有權限的類別）。</p>
              ) : !loading && groups.length === 0 ? (
                <p className="px-4 py-3 text-[var(--soft)]">找不到「{term}」的相關記錄。</p>
              ) : (
                groups.map((g) => (
                  <div key={g.label} className="py-1">
                    <div className="px-4 pb-1 pt-2 text-xs font-medium text-[var(--soft)]">{g.label}</div>
                    {g.items.map((it) => {
                      index += 1;
                      const i = index;
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(it.href)}
                          className={"block w-full px-4 py-2 text-left " + (i === active ? "bg-[var(--cream)]" : "")}
                        >
                          <div className="truncate font-medium">{it.title}</div>
                          <div className="truncate text-xs text-[var(--soft)]">{it.sub}</div>
                        </button>
                      );
                    })}
                    {g.more > 0 && <div className="px-4 py-1 text-xs text-[var(--soft)]">另有 {g.more} 筆，請輸入更完整的關鍵字。</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
