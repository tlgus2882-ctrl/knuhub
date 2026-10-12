-- 과제 첨부파일 (#16)
--
-- 담당 교수와 조교가 과제에 파일을 첨부하고, 그 과목 사람(수강생·조교·담당 교수)이 내려받는다.
-- 첨부파일은 수업 자료라서 과제가 학내 공개여도 과목 밖 사용자에게는 주지 않는다.
-- 브라우저가 파일을 {assignment_id}/{파일 id} 이름으로 올리고 attach_assignment_file()이
-- 첨부로 확정한다. 원래 파일 이름은 DB에만 둔다 (Storage 객체 이름에는 한글을 쓸 수 없다).

insert into storage.buckets (id, name, public, file_size_limit)
values ('assignment-files', 'assignment-files', false, 20971520);

create table public.assignment_file (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 255),
  size bigint not null check (size >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index assignment_file_assignment_id_idx on public.assignment_file (assignment_id, created_at);

alter table public.assignment_file enable row level security;

-- 쓰기는 attach_assignment_file()과 detach_assignment_file()로만 한다.
revoke all on public.assignment_file from anon, authenticated;
grant select on public.assignment_file to authenticated;

-- 그 과목 사람인가: 수강생(조교 포함)이거나 담당 교수
create function public.is_course_member(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_enrolled(target_course) or public.is_course_professor(target_course);
$$;

revoke execute on function public.is_course_member(uuid) from public, anon;
grant execute on function public.is_course_member(uuid) to authenticated;

create policy "그 과목 사람은 과제 첨부파일 목록을 읽는다"
  on public.assignment_file for select to authenticated
  using (
    exists (
      select 1 from public.assignment a
      where a.id = assignment_id and public.is_course_member(a.course_id)
    )
  );

-- Storage 객체 이름의 첫 폴더(과제 id)로 그 과제의 과목을 찾는다. 이름이 이상하면 null.
create function public.assignment_file_course(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(object_name, '/', 1);
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return (select course_id from public.assignment where id = folder::uuid);
end;
$$;

revoke execute on function public.assignment_file_course(text) from public, anon;
grant execute on function public.assignment_file_course(text) to authenticated;

create policy "담당 교수와 조교는 과제 첨부파일을 올린다"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files'
    and public.is_professor_or_assistant(public.assignment_file_course(name))
  );

create policy "담당 교수와 조교는 과제 첨부파일을 지운다"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assignment-files'
    and public.is_professor_or_assistant(public.assignment_file_course(name))
  );

create policy "그 과목 사람은 과제 첨부파일을 읽는다"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and public.is_course_member(public.assignment_file_course(name))
  );

-- 올린 파일을 과제 첨부로 확정한다. 크기는 Storage에 실제로 올라간 객체에서 읽는다.
-- 오류 코드: KH003 담당 교수·조교가 아님, KH004 그 과제 폴더에 올라간 파일이 아님
create function public.attach_assignment_file(target_assignment uuid, storage_path text, name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course uuid;
  object_size bigint;
  attached uuid;
begin
  select course_id into target_course from public.assignment where id = target_assignment;
  if target_course is null or not public.is_professor_or_assistant(target_course) then
    raise exception '이 과제에 파일을 첨부할 수 없어요' using errcode = 'KH003';
  end if;

  select (o.metadata ->> 'size')::bigint into object_size
  from storage.objects o
  where o.bucket_id = 'assignment-files'
    and o.name = attach_assignment_file.storage_path
    and split_part(o.name, '/', 1) = target_assignment::text;
  if object_size is null then
    raise exception '올리지 않은 파일은 첨부할 수 없어요' using errcode = 'KH004';
  end if;

  insert into public.assignment_file (assignment_id, name, size, storage_path)
  values (target_assignment, btrim(attach_assignment_file.name), object_size, attach_assignment_file.storage_path)
  returning id into attached;
  return attached;
end;
$$;

revoke execute on function public.attach_assignment_file(uuid, text, text) from public, anon;
grant execute on function public.attach_assignment_file(uuid, text, text) to authenticated;

-- 첨부를 뗀다. 반환값: Storage에서 지울 storage_path (호출한 쪽이 지운다)
create function public.detach_assignment_file(target_file uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed text;
begin
  delete from public.assignment_file f
  using public.assignment a
  where f.id = target_file
    and a.id = f.assignment_id
    and public.is_professor_or_assistant(a.course_id)
  returning f.storage_path into removed;

  if removed is null then
    raise exception '이 첨부파일을 지울 수 없어요' using errcode = 'KH003';
  end if;
  return removed;
end;
$$;

revoke execute on function public.detach_assignment_file(uuid) from public, anon;
grant execute on function public.detach_assignment_file(uuid) to authenticated;

-- 교수가 탈퇴해 과목이 보관될 때 첨부파일 목록도 보관한다 (docs/adr/0003).
-- 파일은 Storage에 남고 보관 테이블이 위치를 기억한다.
create table public.archived_assignment_file (
  id uuid primary key,
  assignment_id uuid not null references public.archived_assignment (id) on delete cascade,
  name text not null,
  size bigint not null,
  storage_path text not null,
  created_at timestamptz not null
);

alter table public.archived_assignment_file enable row level security;
revoke all on public.archived_assignment_file from anon, authenticated;

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
