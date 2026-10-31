-- 지각 제출과 과제 삭제
--
-- 지각 제출: 과제마다 지각 제출 마감(late_due_at)을 둘 수 있다. 마감이 지나도 지각 제출 마감 전까지는
-- 제출하고, 마감 뒤에 낸 제출물은 지각으로 보인다(submitted_at > due_at). 비워 두면 지각 제출을 받지 않는다.
-- 제출이 완전히 닫히는 때(closes_at)는 지각 제출 마감, 없으면 마감이다. 채점 완료·제출물 공개·
-- 1차 검사·이의신청은 모두 closes_at 뒤에 열린다 (지각 제출자가 공개된 남의 제출물을 보지 않게).
--
-- 과제 삭제: 담당 교수·조교가 delete_assignment()로 지운다. 제출물·리뷰·채점 항목 등은 외래 키로 함께
-- 지워지고, Storage 파일(제출 파일, 첨부파일)은 함수가 돌려준 목록대로 서버가 지운다 (docs/adr/0002).
--
-- 오류 코드: KH003 담당 교수·조교가 아님 (첨부파일과 같은 코드)

alter table public.assignment
  add column late_due_at timestamptz,
  add constraint assignment_late_after_due check (late_due_at is null or late_due_at > due_at),
  add column closes_at timestamptz generated always as (coalesce(late_due_at, due_at)) stored;

grant insert (late_due_at), update (late_due_at) on public.assignment to authenticated;

-- 지금 이 과제에 제출할 수 있는가: 공개된 과제의 수강생이고 제출이 닫히기 전 (지각 제출 기간 포함)
create or replace function public.can_submit(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment
      and published
      and public.is_enrolled(course_id)
      and now() < closes_at
  );
$$;

create or replace function public.can_view_submission(target_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submission s
    join public.assignment a on a.id = s.assignment_id
    where s.id = target_submission
      and (
        -- 작성자 본인
        s.student_id = (select auth.uid())
        -- 그 과목의 담당 교수·조교는 마감 전에도 본다
        or public.is_professor_or_assistant(a.course_id)
        -- 공개 과제는 제출이 닫히고(지각 제출 마감 포함) 채점 완료되면 공개 범위에 따라
        or (
          a.published
          and now() >= a.closes_at
          and a.graded_at is not null
          and (
            a.visibility = 'campus'
            or (a.visibility = 'course' and public.is_enrolled(a.course_id))
          )
        )
      )
  );
$$;

create or replace function public.can_run_first_check(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment and now() >= closes_at and criteria_version > 0
      and public.is_professor_or_assistant(course_id)
  );
$$;

create or replace function public.can_appeal(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment
      and published
      and public.is_enrolled(course_id)
      and now() >= closes_at
      and graded_at is not null
  );
$$;

-- 제출이 닫히기 전(지각 제출 기간 포함)에는 채점 완료일 수 없다. 마감이나 지각 제출 마감을 늦추면
-- 채점 완료가 풀린다. 생성 열(closes_at)은 BEFORE 트리거 뒤에 계산되므로 여기서는 직접 계산한다.
create or replace function public.clear_graded_before_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.late_due_at, new.due_at) > now() then
    new.graded_at := null;
  end if;
  return new;
end;
$$;

drop trigger assignment_clear_graded_before_due on public.assignment;
create trigger assignment_clear_graded_before_due
  before insert or update of due_at, late_due_at, graded_at on public.assignment
  for each row execute function public.clear_graded_before_due();

-- 과제를 지운다. 반환값: Storage에서 지울 객체 (제출 파일과 첨부파일, 과제 폴더 아래 전부). 호출한 쪽이 지운다.
create function public.delete_assignment(target_assignment uuid)
returns table (bucket_id text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course uuid;
begin
  select course_id into target_course from public.assignment where id = target_assignment;
  if target_course is null or not public.is_professor_or_assistant(target_course) then
    raise exception '이 과제를 지울 수 없어요' using errcode = 'KH003';
  end if;

  return query
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('submissions', 'assignment-files')
    and split_part(o.name, '/', 1) = target_assignment::text;

  delete from public.assignment where id = target_assignment;
end;
$$;

revoke execute on function public.delete_assignment(uuid) from public, anon;
grant execute on function public.delete_assignment(uuid) to authenticated;
