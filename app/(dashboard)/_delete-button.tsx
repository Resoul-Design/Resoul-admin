"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// 刪除掣：先確認，再以 ID 直接呼叫伺服器動作。
// 不放在表格內作 formAction 提交——該寫法在 Next.js 15 下不會傳送掣上的 name／value，伺服器收不到要刪除的 ID。
export function DeleteButton({
  id,
  action,
  confirmText,
  label = "刪除",
  className = "rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50",
}: {
  id: string;
  action: (id: string) => Promise<{ error?: string } | void>;
  confirmText: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          setError("");
          startTransition(async () => {
            const result = await action(id);
            if (result && result.error) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "刪除中…" : label}
      </button>
    </span>
  );
}
