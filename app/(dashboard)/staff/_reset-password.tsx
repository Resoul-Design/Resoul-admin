"use client";

import { isBackdropPress } from "../_modal";
import { useState, useTransition } from "react";
import { resetStaffPassword } from "./actions";

// 產生易於口頭轉告的臨時密碼（不含易混淆字元）
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

// 管理員為員工重設密碼
export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function close() {
    setOpen(false);
    setPw("");
    setMsg("");
    setDone(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (pw.length < 8) return setMsg("密碼至少 8 個字元");
    if (!window.confirm(`確定重設「${name}」的密碼？舊密碼會即時失效。`)) return;
    start(async () => {
      const res = await resetStaffPassword(id, pw);
      if (res.error) return setMsg(res.error);
      setDone(true);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs px-3 py-1 rounded-md border border-[var(--line)] bg-white hover:bg-[var(--cream)]">
        重設密碼
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4 text-left" onMouseDown={(e) => { if (isBackdropPress(e)) close(); }}>
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-1">重設密碼</h3>
            <p className="text-sm text-[var(--soft)] mb-4 break-words">{name}</p>
            {done ? (
              <>
                <p className="text-sm text-green-700 mb-2">密碼已重設。請將新密碼告知對方，並提醒對方登入後到右上角「修改密碼」。</p>
                <p className="mb-4 select-all rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-mono text-sm break-all">{pw}</p>
                <div className="flex justify-end">
                  <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">完成</button>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <label className="block text-sm text-[var(--soft)] mb-1">新密碼</label>
                <input
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={72}
                  placeholder="至少 8 個字元"
                  className="w-full mb-2 px-3 py-2 rounded-lg border border-[var(--line)] bg-white font-mono outline-none focus:border-[var(--gold)]"
                />
                <button type="button" onClick={() => setPw(generatePassword())} className="mb-3 text-xs text-[var(--gold)] hover:underline">自動產生密碼</button>
                {msg && <p className="text-sm text-red-700 mb-3" role="alert">{msg}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-sm text-[var(--soft)] hover:bg-[var(--cream)]">取消</button>
                  <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90 disabled:opacity-50">{pending ? "處理中…" : "重設密碼"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
