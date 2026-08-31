"use client";

import { useState } from "react";
import { MODULES } from "@/lib/modules";
import { updateStaffPermissions } from "./actions";

export function PermsButton({
  id,
  name,
  role,
  permissions,
}: {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);

  if (role === "admin") {
    return <span className="text-xs text-[var(--soft)]">全部權限</span>;
  }

  const set = new Set(permissions);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]"
      >
        權限（{permissions.length}）
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4 py-8 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-6 w-full max-w-md my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{name} · 功能權限</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--soft)] hover:text-[var(--ink)]">✕</button>
            </div>
            <form action={updateStaffPermissions} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={id} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-5">
                {MODULES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={"perm_" + m.key} defaultChecked={set.has(m.key)} />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[var(--soft)] hover:bg-[var(--cream)]">
                  取消
                </button>
                <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
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
