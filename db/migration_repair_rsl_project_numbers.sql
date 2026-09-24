-- 專案編號只可使用 RSL-YYMMDD-XXXX 格式。
-- 此修復只會由既有備註中的 RSL 編號回填空白或 UUID case_no；
-- 不會為找不到 RSL 的舊資料猜測或建立新編號。

begin;

with candidates as (
  select
    id,
    upper((regexp_match(notes, '(?i)(?:專案編號|project no[.])[：:]\s*(RSL-[A-Z0-9]+-[A-Z0-9]+)'))[1]) as project_no
  from public.cremation_bookings
  where notes is not null
), repaired as (
  update public.cremation_bookings as booking
  set case_no = candidates.project_no
  from candidates
  where booking.id = candidates.id
    and candidates.project_no is not null
    and (
      booking.case_no is null
      or btrim(booking.case_no) = ''
      or booking.case_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  returning booking.id, booking.case_no
)
select count(*) as repaired_rsl_project_numbers from repaired;

-- 檢查仍未能可靠辨識專案的舊 UUID。這些資料需要人工核對，絕不可自動猜號。
select id, owner_name, pet_name, case_no, created_at
from public.cremation_bookings
where case_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
order by created_at desc;

commit;
