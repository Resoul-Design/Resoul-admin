"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function friendlyError(msg: string) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid email or password"))
    return "電郵或密碼不正確。";
  if (m.includes("email not confirmed")) return "此帳戶尚未啟用，請聯絡管理員。";
  if (m.includes("too many") || m.includes("rate")) return "嘗試次數過多，請稍後再試。";
  return "登入失敗，請稍後再試，或聯絡管理員。";
}

function safePath(p: string | null) {
  // 只接受站內相對路徑，避免開放式轉址
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safePath(params.get("callbackUrl"));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(friendlyError(error.message));
      setLoading(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function onForgot() {
    setError("");
    setInfo("");
    if (!email) {
      setError("請先輸入電郵，再按「忘記密碼」。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    setLoading(false);
    // 不透露帳戶是否存在
    setInfo("若該電郵是有效帳戶，我們已發送密碼重設連結，請查看電郵。");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 shadow-sm"
    >
      <div className="flex flex-col items-center mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/resoul-wordmark.png" alt="Resoul" className="h-12 w-auto" />
        <div className="brand-slogan text-sm text-[var(--soft)] mt-2">Your last greatest love to show</div>
        <div className="text-sm text-[var(--ink)] mt-3">後台管理系統</div>
      </div>

      <label className="block text-sm text-[var(--soft)] mb-1">電郵</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full mb-4 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
        placeholder="you@resoul…"
      />

      <label className="block text-sm text-[var(--soft)] mb-1">密碼</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full mb-2 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
        placeholder="••••••••"
      />

      <div className="mb-4 text-right">
        <button type="button" onClick={onForgot} className="text-xs text-[var(--gold)] hover:underline">
          忘記密碼？
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 leading-relaxed">{error}</p>}
      {info && <p className="text-sm text-green-700 mb-4 leading-relaxed">{info}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[var(--gold)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
      >
        {loading ? "處理中…" : "登入"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-sm text-[var(--soft)]">載入中…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
