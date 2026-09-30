// 轉頁時即時顯示，並令導覽連結的預先載入只取版面、不在背景執行整頁查詢。
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="載入中">
      <div className="mb-6 h-8 w-48 rounded-lg bg-[var(--line)]" />
      <div className="space-y-3">
        <div className="h-20 rounded-2xl bg-[var(--head)]" />
        <div className="h-20 rounded-2xl bg-[var(--head)]" />
        <div className="h-20 rounded-2xl bg-[var(--head)]" />
      </div>
    </div>
  );
}
