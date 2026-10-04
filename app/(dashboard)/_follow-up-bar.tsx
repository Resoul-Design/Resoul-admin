"use client";

// 列表頂部的跟進摘要列（與接送服務一致）：今日要跟進數量＋「只顯示要跟進」切換
export function FollowUpBar({ ready, count, only, onToggle }: { ready: boolean; count: number; only: boolean; onToggle: () => void }) {
  if (!ready) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        未啟用跟進：請先於 Supabase（diyxcx）執行 <code>db/migration_follow_ups.sql</code>。
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--head)] px-4 py-3 text-sm">
      <span>🔔 今日要跟進 <b className={count ? "text-amber-700" : ""}>{count}</b> 張</span>
      {(only || count > 0) && (
        <button type="button" onClick={onToggle} className="text-[var(--gold)] hover:underline">
          {only ? "顯示全部" : "只顯示要跟進"}
        </button>
      )}
      <span className="text-xs text-[var(--soft)]">需要跟進的記錄以淡黃色標示，按該行「🔔」掣處理。</span>
    </div>
  );
}
