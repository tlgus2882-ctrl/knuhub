-- 셀프 점검 (v2, #48)
--
-- 학생이 마감 전에 자기 제출물을 채점 항목별로 AI에게 점검받는다. 결과는 그 학생만 본다.
-- 서버 액션이 start_self_check()로 횟수를 먼저 차감하고 AI를 부른 뒤, 서버(secret key)가 결과를
-- self_check에 넣는다. 학생은 결과를 직접 넣을 수 없다 (한도·마감을 건너뛴 결과가 생기지 않게).
-- "너무 큼"이거나 AI 호출이 실패하면 서버가 refund_self_check()로 횟수를 되돌린다.
-- 횟수는 제출물과 따로 기록해서, 제출물을 지웠다 다시 내도 되돌아가지 않는다.
-- 교수가 탈퇴해도 셀프 점검은 보관하지 않는다 (ADR-0003의 보관 대상 아님): 그 학생만 보는 기록이라
-- 과목과 함께 지워진다.
--
-- 오류 코드: KH008 셀프 점검을 쓸 수 없음 (수강생 아님, 마감 지남, 채점 항목 없음, 제출물 없음),
--           KH009 셀프 점검 횟수를 다 씀

-- 과제당 셀프 점검 횟수 한도 (설정값). 바꾸려면 이 함수만 고친다.
create function public.self_check_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 3 $$;

grant execute on function public.self_check_limit() to authenticated;

create table public.self_check_usage (
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  student_id uuid not null references public.profile (id) on delete cascade,
  used int not null default 0 check (used >= 0),
  primary key (assignment_id, student_id)
);

alter table public.self_check_usage enable row level security;

-- 쓰기는 start_self_check()·refund_self_check()로만 한다.
revoke all on public.self_check_usage from anon, authenticated;
grant select on public.self_check_usage to authenticated;

create policy "내 셀프 점검 횟수를 읽는다"
  on public.self_check_usage for select to authenticated
  using (student_id = (select auth.uid()));

-- 셀프 점검 결과 하나. 점검한 제출물의 제출 시각과 채점 항목 버전, 그때의 채점 항목을 함께 남겨
-- 재제출이나 채점 항목 수정 뒤에도 "이전 제출물"·"이전 채점 항목 기준"으로 보여 줄 수 있다.
-- 제출물을 지우면(탈퇴 포함) 결과도 지워진다.
create table public.self_check (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submission (id) on delete cascade,
  submitted_at timestamptz not null,
  criteria_version int not null,
  -- [{ "name", "points", "description" }, ...] 점검할 때의 채점 항목 (순서대로)
  criteria jsonb not null,
  -- [{ "criterion", "verdict", "evidence": [{ "path", "start_line", "end_line" }], "comment" }, ...]
  opinions jsonb not null,
  created_at timestamptz not null default now()
);

create index on public.self_check (submission_id);

alter table public.self_check enable row level security;

-- 쓰기는 서버(secret key)만 한다.
revoke all on public.self_check from anon, authenticated;
grant select on public.self_check to authenticated;

-- 교수·조교도 읽지 못한다. 학생이 부담 없이 점검하게.
create policy "내 제출물의 셀프 점검 결과를 읽는다"
  on public.self_check for select to authenticated
  using (exists (
    select 1 from public.submission s where s.id = submission_id and s.student_id = (select auth.uid())
  ));

-- 셀프 점검을 시작하며 횟수를 하나 차감한다. 반환값: 남은 횟수
-- 확인과 차감을 한 문장으로 해서 동시에 눌러도 한도를 넘지 않는다.
create function public.start_self_check(target_assignment uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  now_used int;
begin
  if not public.can_submit(target_assignment)
    or not exists (select 1 from public.assignment where id = target_assignment and criteria_version > 0)
    or not exists (select 1 from public.submission where assignment_id = target_assignment and student_id = me)
  then
    raise exception '이 과제에서는 셀프 점검을 쓸 수 없어요' using errcode = 'KH008';
  end if;

  insert into public.self_check_usage as u (assignment_id, student_id, used)
  values (target_assignment, me, 1)
  on conflict (assignment_id, student_id) do update
    set used = u.used + 1
    where u.used < public.self_check_limit()
  returning used into now_used;

  if now_used is null then
    raise exception '셀프 점검 횟수를 다 썼어요' using errcode = 'KH009';
  end if;
  return public.self_check_limit() - now_used;
end;
$$;

revoke execute on function public.start_self_check(uuid) from public, anon;
grant execute on function public.start_self_check(uuid) to authenticated;

-- 차감한 횟수 하나를 되돌린다. 학생이 직접 부르면 한도를 우회할 수 있으므로 서버(secret key)만 부른다.
create function public.refund_self_check(target_assignment uuid, target_student uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.self_check_usage
  set used = used - 1
  where assignment_id = target_assignment and student_id = target_student and used > 0;
$$;

revoke execute on function public.refund_self_check(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refund_self_check(uuid, uuid) to service_role;
