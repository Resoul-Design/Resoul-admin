import type { ReactNode } from "react";

// 統一頁面標題列：固定高度（與按鈕同高）及下方間距，轉頁時內容起點一致
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex min-h-10 flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold leading-10">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// 標題列右側的次要按鈕（返回、查看等連結）樣式
export const headerLinkClass =
  "rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[var(--cream)]";
