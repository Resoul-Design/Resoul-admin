"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

const DIRTY = ["ring-2", "ring-[var(--gold)]"];

// 「儲存全部」：所有評價放在同一份表格，只提交有修改過的評價
export function BulkReviewsForm({ action, children }: { action: (data: FormData) => Promise<void>; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [changed, setChanged] = useState<string[]>([]);

  useEffect(() => {
    if (!changed.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);

  function markChanged(e: FormEvent<HTMLFormElement>) {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-review-id]");
    const id = card?.dataset.reviewId;
    if (!card || !id) return;
    card.classList.add(...DIRTY);
    setChanged((list) => (list.includes(id) ? list : [...list, id]));
  }

  async function submit(data: FormData) {
    await action(data);
    formRef.current?.querySelectorAll("[data-review-id]").forEach((card) => card.classList.remove(...DIRTY));
    setChanged([]);
  }

  return (
    <form ref={formRef} action={submit} onInput={markChanged} onChange={markChanged}>
      <input type="hidden" name="changed_ids" value={changed.join(",")} />
      {children}
      <SaveBar count={changed.length} />
    </form>
  );
}

function SaveBar({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-lg">
      <span className="text-sm text-[var(--soft)]">{count ? `${count} 則評價有未儲存修改` : "所有修改已儲存"}</span>
      <button type="submit" disabled={!count || pending} className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "儲存中…" : count ? `儲存全部（${count}）` : "儲存全部"}
      </button>
    </div>
  );
}
