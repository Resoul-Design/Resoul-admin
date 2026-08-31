export type ModuleDef = { key: string; label: string; href: string };

// 功能模組（權限單位）。總覽不列入，所有員工可見。
export const MODULES: ModuleDef[] = [
  { key: "bookings", label: "客戶預約火化記錄", href: "/bookings" },
  { key: "schedule", label: "安排火化服務", href: "/schedule" },
  { key: "board_blog", label: "照顧誌留言", href: "/board/blog" },
  { key: "board_community", label: "同路人留言板", href: "/board/community" },
  { key: "orders", label: "客戶訂單", href: "/orders" },
  { key: "inventory", label: "倉存 · 出貨", href: "/inventory" },
  { key: "articles", label: "文章記錄", href: "/articles" },
  { key: "roster", label: "排更表", href: "/staff/roster" },
  { key: "tasks", label: "任務指派", href: "/staff/tasks" },
  { key: "staff", label: "員工管理", href: "/staff" },
  { key: "finance", label: "財務管理", href: "/finance" },
  { key: "crm", label: "客戶檔案", href: "/crm" },
  { key: "reports", label: "報表與匯出", href: "/reports" },
];

const BY_HREF = [...MODULES].sort((a, b) => b.href.length - a.href.length);

// 由路徑找對應模組 key（最長前綴優先）；非模組路徑回傳 null
export function moduleForPath(path: string): string | null {
  for (const m of BY_HREF) {
    if (path === m.href || path.startsWith(m.href + "/")) return m.key;
  }
  return null;
}

export function keyForHref(href: string): string | null {
  const m = MODULES.find((x) => x.href === href);
  return m ? m.key : null;
}

// 管理員全部可存取；其他人按 permissions 陣列
export function canAccess(
  role: string | undefined,
  permissions: string[] | null | undefined,
  key: string | null
): boolean {
  if (!key) return true; // 總覽等非模組頁
  if (role === "admin") return true;
  return (permissions || []).includes(key);
}
