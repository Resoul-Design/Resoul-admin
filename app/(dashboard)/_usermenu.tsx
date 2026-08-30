"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) {
      setOk(false);
      setMsg("密碼至少 6 個字元");
      return;
    }
    if (pw !== pw2) {
      setOk(false);
      setMsg("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setOk(false);
      setMsg("更新失敗：" + error.message);
      return;
    }
    setOk(true);
    setMsg("密碼已更新 ✅");
    setPw("");
    setPw2("");
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">修改密碼</h3>
        <form onSubmit={submit}>
          <label className="block text-sm text-[var(--soft)] mb-1">新密碼</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            placeholder="至少 6 個字元"
          />
          <label className="block text-sm text-[var(--soft)] mb-1">確認新密碼</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            placeholder="再次輸入"
          />
          {msg && (
            <p
              className={
                "text-sm mb-3 " + (ok ? "text-green-600" : "text-red-600")
              }
            >
              {msg}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[var(--soft)] hover:bg-[var(--cream)]"
            >
              關閉
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "更新中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-1.5 py-1 rounded-full hover:bg-[var(--cream)] transition"
      >
        <span className="w-8 h-8 rounded-full bg-[var(--gold)] text-white grid place-items-center text-sm font-medium">
          {initial}
        </span>
        <span className="hidden sm:block text-sm text-[var(--ink)] max-w-[120px] truncate">
          {name}
        </span>
        <span className="text-xs text-[var(--soft)]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)] z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line)]">
              <div className="text-sm text-[var(--ink)] truncate">{name}</div>
              <div className="text-xs text-[var(--soft)]">{role}</div>
            </div>
            <button
              onClick={() => {
                setPwOpen(true);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--cream)]"
            >
              修改密碼
            </button>
            <form action="/auth/signout" method="post" className="border-t border-[var(--line)]">
              <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--soft)] hover:bg-[var(--cream)]">
                登出
              </button>
            </form>
          </div>
        </>
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}
