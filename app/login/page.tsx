"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("登入失敗：" + error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 shadow-sm"
      >
        <div className="flex flex-col items-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/resoul-wordmark.png" alt="Resoul" className="h-12 w-auto" />
          <div className="brand-slogan text-sm text-[var(--soft)] mt-2">
            Your last greatest love to show
          </div>
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
          className="w-full mb-5 px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
          placeholder="••••••••"
        />

        {error && (
          <p className="text-sm text-red-600 mb-4 leading-relaxed">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[var(--gold)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
