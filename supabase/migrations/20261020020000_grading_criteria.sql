-- 채점 항목 (v2, #46)
--
-- 과제의 채점 기준표를 나눈 항목. 담당 교수·조교가 save_grading_criteria()로 목록을 통째로
-- 저장한다. 저장한 채점 항목이 곧 확정된 채점 항목이다 (AI 초안은 저장 전까지 편집 칸에만 있다).
-- 저장할 때마다 과제의 criteria_version이 1 오른다. AI 검토 의견은 이 버전을 기억해
-- "이전 채점 항목 기준"인지 판단한다.
--
-- 오류 코드: KH003 담당 교수·조교가 아님, KH007 채점 항목 목록이 잘못됨

alter table public.assignment
  -- 0이면 아직 채점 항목을 저장하지 않았다
  add column criteria_version int not null default 0;

create table public.grading_criterion (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  position int not null,
  name text not null,
  points int not null,
  description text not null default '',
  unique (assignment_id, position)
);

alter table public.grading_criterion enable row level security;

-- 쓰기는 save_grading_criteria()로만 한다.
revoke all on public.grading_criterion from anon, authenticated;
grant select on public.grading_criterion to authenticated;

-- 과제를 볼 수 있는 사람이 채점 항목도 본다 (비공개 과제는 assignment RLS가 담당 교수·조교로 좁힌다).
create policy "볼 수 있는 과제의 채점 항목을 읽는다"
  on public.grading_criterion for select to authenticated
  using (exists (select 1 from public.assignment a where a.id = assignment_id));

-- 채점 항목 목록을 통째로 바꾼다. 반환값: 새 채점 항목 버전
-- criteria: [{ "name": "insert 동작", "points": 30, "description": "..." }, ...] (순서대로)
create function public.save_grading_criteria(target_assignment uuid, criteria jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course uuid;
  new_version int;
begin
  select course_id into target_course from public.assignment where id = target_assignment;
  if target_course is null or not public.is_professor_or_assistant(target_course) then
    raise exception '이 과제의 채점 항목을 정할 수 없어요' using errcode = 'KH003';
  end if;

  if jsonb_typeof(criteria) is distinct from 'array'
    or jsonb_array_length(criteria) > 50
    or exists (
      select 1 from jsonb_array_elements(criteria) c
      where jsonb_typeof(c -> 'points') is distinct from 'number'
        or length(btrim(coalesce(c ->> 'name', ''))) not between 1 and 200
        or (c ->> 'points')::numeric not between 0 and 1000
        or (c ->> 'points')::numeric <> trunc((c ->> 'points')::numeric)
        or length(coalesce(c ->> 'description', '')) > 2000
    )
  then
    raise exception '채점 항목은 이름(200자까지), 0~1000점 정수 배점, 설명(2000자까지)으로 50개까지 정할 수 있어요'
      using errcode = 'KH007';
  end if;

  delete from public.grading_criterion where assignment_id = target_assignment;

  insert into public.grading_criterion (assignment_id, position, name, points, description)
  select target_assignment, c.ordinality - 1, btrim(c.value ->> 'name'), (c.value ->> 'points')::int,
         btrim(coalesce(c.value ->> 'description', ''))
  from jsonb_array_elements(criteria) with ordinality c;

  update public.assignment set criteria_version = criteria_version + 1
  where id = target_assignment
  returning criteria_version into new_version;

  return new_version;
end;
$$;

revoke execute on function public.save_grading_criteria(uuid, jsonb) from public, anon;
grant execute on function public.save_grading_criteria(uuid, jsonb) to authenticated;

-- 보관 ----------------------------------------------------------------------
-- 교수가 탈퇴해 과목이 보관될 때 채점 항목도 보관한다 (docs/adr/0003).

create table public.archived_grading_criterion (
  id uuid primary key,
  assignment_id uuid not null references public.archived_assignment (id) on delete cascade,
  position int not null,
  name text not null,
  points int not null,
  description text not null
);

alter table public.archived_grading_criterion enable row level security;
revoke all on public.archived_grading_criterion from anon, authenticated;

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
