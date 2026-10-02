-- 使用教學獨立權限（2026-10-03）
-- 後台「系統 → 使用教學」改為按權限顯示（key: guide）。
-- 此腳本令現有員工保留查看使用教學的權限（可重複執行）；之後可在員工管理逐個取消。
update public.staff
set permissions = array_append(coalesce(permissions, '{}'), 'guide')
where not ('guide' = any(coalesce(permissions, '{}')));
