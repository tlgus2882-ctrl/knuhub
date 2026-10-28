-- 채점 완료 (#77)
--
-- 제출물은 마감이 지나고 담당 교수·조교가 과제를 채점 완료로 표시해야 공개 범위에 따라 공개된다.
-- 채점 완료를 취소하면 다시 작성자 본인과 담당 교수·조교만 본다. 점수는 저장하지 않는다.
alter table public.assignment
  add column graded_at timestamptz;

-- 이미 마감된 과제는 지금처럼 계속 공개되도록 채점 완료로 둔다.
update public.assignment set graded_at = due_at where due_at <= now();

-- 고치기 정책(담당 교수와 조교만)을 그대로 따른다.
grant update (graded_at) on public.assignment to authenticated;

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
        -- 공개 과제는 마감 후 채점 완료되면 공개 범위에 따라
        or (
          a.published
          and now() >= a.due_at
          and a.graded_at is not null
          and (
            a.visibility = 'campus'
            or (a.visibility = 'course' and public.is_enrolled(a.course_id))
          )
        )
      )
  );
$$;

-- 마감 전 과제는 채점 완료일 수 없다. 마감을 연장하면 채점 완료가 풀려서,
-- 새 마감이 지나도 다시 채점 완료를 눌러야 공개된다.
create function public.clear_graded_before_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.due_at > now() then
    new.graded_at := null;
  end if;
  return new;
end;
$$;

create trigger assignment_clear_graded_before_due
  before insert or update of due_at, graded_at on public.assignment
  for each row execute function public.clear_graded_before_due();
