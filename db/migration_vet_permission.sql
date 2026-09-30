-- 獸醫評估獨立權限（2026-09-30）
-- 以往「火化預約」(bookings) 權限同時包括獸醫評估；現分開為 vet_assessments。
-- 此腳本令原本有 bookings 權限的員工保留獸醫評估權限（可重複執行）。
update public.staff
set permissions = array_append(permissions, 'vet_assessments')
where 'bookings' = any(permissions)
  and not ('vet_assessments' = any(permissions));
