-- 마감 뒤 채점과 자동 채점 완료
--
-- 채점(1차 검사, 채점 완료 버튼)은 지각 제출 기간이어도 마감만 지나면 할 수 있다.
-- 채점 완료는 graded_at 시각이 지나야 성립한다. 지각 제출을 받는 과제는 저장할 때 graded_at을
-- 지각 제출 마감으로 예약해 두어, 지나면 누르지 않아도 채점 완료가 된다(지각 제출 마감을 옮기면
-- 예약도 따라간다). 버튼으로 지금 채점 완료하거나 예약을 취소(비움)할 수도 있다.
-- 제출물 공개와 이의신청은 여전히 제출이 닫힌 뒤(closes_at)에만 열린다: 지각 제출 기간에 채점 완료를
-- 눌러도 지각으로 낼 학생이 남의 제출물을 먼저 보지 못한다.

create or replace function public.can_run_first_check(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment and now() >= due_at and criteria_version > 0
      and public.is_professor_or_assistant(course_id)
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
        -- 공개 과제는 제출이 닫히고(지각 제출 마감 포함) 채점 완료되면(예약 시각이 지나면) 공개 범위에 따라
        or (
          a.published
          and now() >= a.closes_at
          and a.graded_at <= now()
          and (
            a.visibility = 'campus'
            or (a.visibility = 'course' and public.is_enrolled(a.course_id))
          )
        )
      )
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
      and graded_at <= now()
  );
$$;

-- 채점 완료 시각 정하기:
-- 1) 마감 전으로는 둘 수 없다. 마감을 그 시각 뒤로 늦추면 채점 완료가 풀린다.
-- 2) 지각 제출을 받는데 채점 완료가 비어 있거나 예전 지각 제출 마감에 예약돼 있었으면,
--    마감·지각 제출 마감을 정할 때 새 지각 제출 마감으로 예약한다. 버튼으로 비운(예약 취소) 것은 그대로 둔다.
create or replace function public.clear_graded_before_due()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  deadlines_changed boolean := tg_op = 'INSERT'
    or new.due_at is distinct from old.due_at
    or new.late_due_at is distinct from old.late_due_at;
  was_scheduled boolean := tg_op = 'UPDATE' and old.late_due_at is not null and old.graded_at = old.late_due_at;
begin
  if new.graded_at is not null and new.graded_at < new.due_at then
    new.graded_at := null;
  end if;
  if deadlines_changed and new.late_due_at is not null
    and (new.graded_at is null or (was_scheduled and new.graded_at is not distinct from old.graded_at)) then
    new.graded_at := new.late_due_at;
  end if;
  if deadlines_changed and new.late_due_at is null and was_scheduled and new.graded_at is not distinct from old.graded_at then
    -- 지각 제출을 끄면 그 예약도 지운다
    new.graded_at := null;
  end if;
  return new;
end;
$$;

-- 지각 제출을 받는 과제 중 채점 완료가 비어 있는 것은 지각 제출 마감으로 예약한다.
update public.assignment set graded_at = late_due_at where late_due_at is not null and graded_at is null;
