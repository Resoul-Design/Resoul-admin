"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (password.length < 6) {
      setErr("密碼至少需要 6 個字元。");
      return;
    }
    if (password !== confirm) {
      setErr("兩次輸入的密碼不一致。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setErr("無法重設密碼，重設連結可能已過期或無效，請在登入頁重新申請。");
      return;
    }
    setMsg("密碼已更新，正在前往後台…");
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-12 w-auto" />
          <div className="text-sm text-[var(--ink)] mt-3">重設密碼</div>
        </div>

        <label className="block text-sm text-[var(--soft)] mb-1">新密碼</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-4 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
          placeholder="至少 6 個字元"
        />
        <label className="block text-sm text-[var(--soft)] mb-1">確認新密碼</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full mb-5 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
          placeholder="再次輸入"
        />

        {err && <p className="text-sm text-red-600 mb-4 leading-relaxed">{err}</p>}
        {msg && <p className="text-sm text-green-700 mb-4 leading-relaxed">{msg}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[var(--gold)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? "處理中…" : "更新密碼"}
        </button>
        <p className="mt-4 text-center text-xs text-[var(--soft)]">
          須由密碼重設電郵中的連結進入此頁；若連結過期，請在
          <a href="/login" className="text-[var(--gold)] hover:underline">登入頁</a>重新申請。
        </p>
      </form>
    </div>
  );
}
