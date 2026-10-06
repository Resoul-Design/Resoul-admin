export type ModuleDef = { key: string; label: string; href: string };

// 功能模組（權限單位）。總覽不列入，所有員工可見。名稱與導覽列按鈕一致，次序跟導覽列。
export const MODULES: ModuleDef[] = [
  { key: "deposits", label: "接送服務", href: "/deposits" },
  { key: "bookings", label: "火化預約", href: "/bookings" },
  { key: "vet_assessments", label: "獸醫評估", href: "/vet-assessments" },
  { key: "orders", label: "紀念品訂單", href: "/orders" },
  { key: "inventory", label: "倉存 · 出貨", href: "/inventory" },
  { key: "replies", label: "回覆助手", href: "/replies" },
  { key: "board_community", label: "主人評價及故事分享", href: "/board/community" },
  { key: "articles", label: "文章記錄", href: "/articles" },
  { key: "site_content", label: "網站內容", href: "/site-content" },
  { key: "staff", label: "員工管理", href: "/staff" },
  { key: "roster", label: "排更表", href: "/staff/roster" },
  { key: "tasks", label: "任務指派", href: "/staff/tasks" },
  { key: "finance", label: "財務管理", href: "/finance" },
  { key: "projects", label: "專案管理", href: "/projects" },
  { key: "crm", label: "客戶檔案", href: "/crm" },
  { key: "reports", label: "報表與匯出", href: "/reports" },
  { key: "audit", label: "審計記錄", href: "/audit" },
  { key: "sync", label: "同步狀態", href: "/sync" },
  { key: "guide", label: "使用教學", href: "/guide" },
];

// 不在導覽列、但屬於某模組的路徑（使用教學嵌入的手冊網頁 public/manual）
const EXTRA_ROUTES: ModuleDef[] = [{ key: "guide", label: "使用教學", href: "/manual" }];

const ROUTES = [...MODULES, ...EXTRA_ROUTES].sort((a, b) => b.href.length - a.href.length);

// 由路徑找對應模組 key（最長前綴優先）；非模組路徑回傳 null
export function moduleForPath(path: string): string | null {
  for (const m of ROUTES) {
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
