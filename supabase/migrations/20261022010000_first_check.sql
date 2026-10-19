-- 1차 검사 (v2, #49)
--
-- 마감 후 담당 교수·조교가 "전체 검사"를 누르면 검사할 제출물이 대기열(first_check_queue)에 들어간다.
-- 화면이 몇 초마다 서버 액션을 부르고, 서버 액션은 claim_first_check()로 몇 개를 맡아 AI로 검사한 뒤
-- 서버(secret key)가 결과(first_check)를 쓰고 대기열에서 지운다. 실패하면 맡은 것을 풀고 대기열 맨 뒤로
-- 보낸다 (계속 실패하는 제출물 하나가 나머지를 막지 않게).
-- 5분 넘게 끝나지 않은 맡김은 함수가 중간에 죽은 것으로 보고 다시 맡을 수 있다.
-- (Message Batches 대신 이렇게 나눠 보낸다: 개발 중 Gemini 무료 키로 돌리기 위해. 유료 키로 바꿀 때 다시 정한다.)
--
-- 결과는 제출물마다 최신 하나다. 대상은 결과가 없거나, 결과의 제출 시각·채점 항목 버전이 지금과 다른 제출물이다.
-- 결과는 담당 교수·조교만 읽는다. 교수가 탈퇴하면 결과도 보관한다 (ADR-0003). 대기열은 보관하지 않는다.
--
-- 오류 코드: KH010 1차 검사를 할 수 없음 (담당 교수·조교가 아님, 마감 전, 채점 항목 없음)

-- 지금 이 과제에 1차 검사를 할 수 있는가: 담당 교수·조교이고, 현재 마감일이 지났고, 채점 항목이 있다
create function public.can_run_first_check(target_assignment uuid)
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

revoke execute on function public.can_run_first_check(uuid) from public, anon;
grant execute on function public.can_run_first_check(uuid) to authenticated;

create table public.first_check (
  submission_id uuid primary key references public.submission (id) on delete cascade,
  submitted_at timestamptz not null,
  criteria_version int not null,
  -- [{ "name", "points", "description" }, ...] 검사할 때의 채점 항목 (순서대로)
  criteria jsonb not null,
  -- reviewed: 검사함, unreviewable: 검사할 수 없음 (너무 크거나 텍스트 파일이 없음)
  status text not null check (status in ('reviewed', 'unreviewable')),
  -- [{ "criterion", "verdict", "evidence": [{ "path", "start_line", "end_line" }], "comment" }, ...] (unreviewable이면 빈 배열)
  opinions jsonb not null default '[]',
  -- 의심: 부족이나 판단 불가가 하나라도 있다 (규칙, 서버가 정해서 넣는다)
  suspicious boolean not null default false,
  checked_at timestamptz not null default now()
);

alter table public.first_check enable row level security;

-- 쓰기는 서버(secret key)만 한다.
revoke all on public.first_check from anon, authenticated;
grant select on public.first_check to authenticated;

create policy "담당 과목 제출물의 1차 검사 결과를 읽는다"
  on public.first_check for select to authenticated
  using (exists (
    select 1 from public.submission s
    join public.assignment a on a.id = s.assignment_id
    where s.id = submission_id and public.is_professor_or_assistant(a.course_id)
  ));

create table public.first_check_queue (
  submission_id uuid primary key references public.submission (id) on delete cascade,
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  queued_at timestamptz not null default now(),
  -- 서버가 맡은 시각 (null이면 아직 아무도 안 맡음)
  claimed_at timestamptz
);

create index on public.first_check_queue (assignment_id, queued_at);

-- 진행 상황의 분모: 마지막 요청 때 대기열에 든 제출물 수
create table public.first_check_run (
  assignment_id uuid primary key references public.assignment (id) on delete cascade,
  total int not null,
  requested_at timestamptz not null default now()
);

alter table public.first_check_queue enable row level security;
alter table public.first_check_run enable row level security;
revoke all on public.first_check_queue, public.first_check_run from anon, authenticated;
grant select on public.first_check_queue, public.first_check_run to authenticated;

create policy "담당 과목의 1차 검사 대기열을 읽는다"
  on public.first_check_queue for select to authenticated
  using (exists (select 1 from public.assignment a where a.id = assignment_id and public.is_professor_or_assistant(a.course_id)));

create policy "담당 과목의 1차 검사 진행 상황을 읽는다"
  on public.first_check_run for select to authenticated
  using (exists (select 1 from public.assignment a where a.id = assignment_id and public.is_professor_or_assistant(a.course_id)));

-- 검사할 제출물을 대기열에 넣는다. 반환값: 대기열에 있는 제출물 수 (0이면 검사할 것이 없다)
create function public.request_first_check(target_assignment uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  already_queued int;
  added int;
begin
  if not public.can_run_first_check(target_assignment) then
    raise exception '이 과제에서는 지금 1차 검사를 할 수 없어요' using errcode = 'KH010';
  end if;

  select count(*) into already_queued from public.first_check_queue where assignment_id = target_assignment;

  insert into public.first_check_queue (submission_id, assignment_id)
  select s.id, s.assignment_id
  from public.submission s
  join public.assignment a on a.id = s.assignment_id
  left join public.first_check f on f.submission_id = s.id
  where s.assignment_id = target_assignment
    and (f.submission_id is null or f.submitted_at <> s.submitted_at or f.criteria_version <> a.criteria_version)
  on conflict (submission_id) do nothing;
  get diagnostics added = row_count;

  -- 검사 중에 다시 요청하면 진행 상황의 분모에 새로 든 것만 더한다.
  insert into public.first_check_run (assignment_id, total) values (target_assignment, already_queued + added)
  on conflict (assignment_id) do update
    set total = case when already_queued > 0 then public.first_check_run.total + added else excluded.total end,
        requested_at = now();
  return already_queued + added;
end;
$$;

revoke execute on function public.request_first_check(uuid) from public, anon;
grant execute on function public.request_first_check(uuid) to authenticated;

-- 대기열에서 아직 아무도 맡지 않은(또는 5분 넘게 끝나지 않은) 제출물을 max_count개까지 맡는다.
-- 동시에 불러도 같은 제출물을 두 번 맡지 않는다. claimed_at은 맡은 쪽만 풀 수 있게 돌려준다.
create function public.claim_first_check(target_assignment uuid, max_count int)
returns table (submission_id uuid, claimed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_run_first_check(target_assignment) then
    raise exception '이 과제에서는 지금 1차 검사를 할 수 없어요' using errcode = 'KH010';
  end if;

  return query
  update public.first_check_queue q
  set claimed_at = now()
  where q.submission_id in (
    select w.submission_id from public.first_check_queue w
    where w.assignment_id = target_assignment
      and (w.claimed_at is null or w.claimed_at < now() - interval '5 minutes')
    order by w.queued_at
    limit max_count
    for update skip locked
  )
  returning q.submission_id, q.claimed_at;
end;
$$;

revoke execute on function public.claim_first_check(uuid, int) from public, anon;
grant execute on function public.claim_first_check(uuid, int) to authenticated;

-- 진행 상황: total은 마지막 요청 때 대기열에 든 수, remaining은 아직 남은 수
create function public.first_check_progress(target_assignment uuid)
returns table (total int, remaining int)
language sql
stable
set search_path = ''
as $$
  select coalesce((select r.total from public.first_check_run r where r.assignment_id = target_assignment), 0),
         (select count(*)::int from public.first_check_queue q where q.assignment_id = target_assignment);
$$;

revoke execute on function public.first_check_progress(uuid) from public, anon;
grant execute on function public.first_check_progress(uuid) to authenticated;

-- 보관 ----------------------------------------------------------------------
-- 교수가 탈퇴해 과목이 보관될 때 1차 검사 결과도 보관한다 (docs/adr/0003).

create table public.archived_first_check (
  submission_id uuid primary key references public.archived_submission (id) on delete cascade,
  submitted_at timestamptz not null,
  criteria_version int not null,
  criteria jsonb not null,
  status text not null,
  opinions jsonb not null,
  suspicious boolean not null,
  checked_at timestamptz not null
);

alter table public.archived_first_check enable row level security;
revoke all on public.archived_first_check from anon, authenticated;

create or replace function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.archived_course (id, name, semester, section, professor_id, professor_name)
  select c.id, c.name, c.semester, c.section, c.professor_id, old.name
  from public.course c
  where c.professor_id = old.id;

  insert into public.archived_assignment (id, course_id, title, description, due_at, visibility, created_at)
  select a.id, a.course_id, a.title, a.description, a.due_at, a.visibility::text, a.created_at
  from public.assignment a
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_grading_criterion (id, assignment_id, position, name, points, description)
  select g.id, g.assignment_id, g.position, g.name, g.points, g.description
  from public.grading_criterion g
  join public.assignment a on a.id = g.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_assignment_file (id, assignment_id, name, size, storage_path, created_at)
  select f.id, f.assignment_id, f.name, f.size, f.storage_path, f.created_at
  from public.assignment_file f
  join public.assignment a on a.id = f.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_submission (id, assignment_id, student_id, student_name, student_number, submitted_at)
  select s.id, s.assignment_id, s.student_id, p.name, p.student_number, s.submitted_at
  from public.submission s
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  join public.profile p on p.id = s.student_id
  where c.professor_id = old.id;

  insert into public.archived_submission_file (id, submission_id, path, size, storage_path, kind)
  select f.id, f.submission_id, f.path, f.size, f.storage_path, f.kind::text
  from public.submission_file f
  join public.submission s on s.id = f.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_first_check (submission_id, submitted_at, criteria_version, criteria, status, opinions, suspicious, checked_at)
  select f.submission_id, f.submitted_at, f.criteria_version, f.criteria, f.status, f.opinions, f.suspicious, f.checked_at
  from public.first_check f
  join public.submission s on s.id = f.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_submission_history (id, submission_id, submitted_at)
  select h.id, h.submission_id, h.submitted_at
  from public.submission_history h
  join public.submission s on s.id = h.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_submission_history_file (id, history_id, path, size, storage_path, kind)
  select f.id, f.history_id, f.path, f.size, f.storage_path, f.kind::text
  from public.submission_history_file f
  join public.submission_history h on h.id = f.history_id
  join public.submission s on s.id = h.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_review (id, submission_id, author_id, author_name, body, created_at)
  select r.id, r.submission_id, r.author_id, p.name, r.body, r.created_at
  from public.review r
  join public.submission s on s.id = r.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  join public.profile p on p.id = r.author_id
  where c.professor_id = old.id and r.author_id <> old.id;

  delete from public.archived_submission where student_id = old.id;
  delete from public.archived_review where author_id = old.id;

  return old;
end;
$$;
