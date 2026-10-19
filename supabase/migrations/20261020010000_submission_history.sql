-- 제출 이력 (v2, #43)
--
-- 지금 제출물의 파일은 그대로 submission_file에 둔다. 재제출하면 이전 파일 묶음을
-- 제출 이력으로 옮기고, 최근 5개보다 오래된 이력은 지운다. 지운 이력의 Storage 파일은
-- submit_files()가 돌려주고 호출한 쪽이 지운다 (Storage 삭제는 Storage API로만).

create table public.submission_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submission (id) on delete cascade,
  -- 그 파일 묶음을 제출했던 시각
  submitted_at timestamptz not null
);

create index submission_history_submission_id_idx on public.submission_history (submission_id, submitted_at);

create table public.submission_history_file (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.submission_history (id) on delete cascade,
  path text not null,
  size bigint not null,
  -- 같은 객체를 다음 제출에 다시 넣을 수 있으므로 unique가 아니다.
  storage_path text not null,
  kind public.file_kind not null
);

create index submission_history_file_history_id_idx on public.submission_history_file (history_id);
create index submission_history_file_storage_path_idx on public.submission_history_file (storage_path);

alter table public.submission_history enable row level security;
alter table public.submission_history_file enable row level security;

-- 쓰기는 submit_files()와 delete_submission()으로만 한다.
revoke all on public.submission_history, public.submission_history_file from anon, authenticated;
grant select on public.submission_history, public.submission_history_file to authenticated;

create policy "볼 수 있는 제출물의 제출 이력을 읽는다"
  on public.submission_history for select to authenticated
  using (public.can_view_submission(submission_id));

create policy "볼 수 있는 제출물의 제출 이력 파일 목록을 읽는다"
  on public.submission_history_file for select to authenticated
  using (
    exists (
      select 1 from public.submission_history h
      where h.id = history_id and public.can_view_submission(h.submission_id)
    )
  );

-- 지금 제출물이나 제출 이력에 들어 있는 객체인가 (학생이 Storage에서 따로 지울 수 없다)
create or replace function public.is_submitted_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.submission_file where storage_path = object_name)
      or exists (select 1 from public.submission_history_file where storage_path = object_name);
$$;

-- 볼 수 있는 제출물의 지금 파일이거나 제출 이력 파일인가
create or replace function public.can_read_submission_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submission_file
    where storage_path = object_name and public.can_view_submission(submission_id)
  ) or exists (
    select 1
    from public.submission_history_file f
    join public.submission_history h on h.id = f.history_id
    where f.storage_path = object_name and public.can_view_submission(h.submission_id)
  );
$$;

-- 올린 파일 묶음을 내 제출물로 확정한다. 이미 제출했다면 이전 파일 묶음을 제출 이력으로 옮긴다.
-- 반환값: 보관 개수를 넘어 지운 이력의 storage_path 중 더는 쓰이지 않는 것. 호출한 쪽이 Storage에서 지운다.
create or replace function public.submit_files(target_assignment uuid, files jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 제출 이력을 몇 개까지 남길지
  history_keep constant int := 5;
  me uuid := (select auth.uid());
  prefix text := target_assignment::text || '/' || me::text || '/';
  target_submission uuid;
  previous_at timestamptz;
  new_history uuid;
  removed text[];
  file_count int;
  found_count int;
  distinct_objects int;
  distinct_paths int;
  total_size bigint;
  in_my_folder boolean;
begin
  if not public.can_submit(target_assignment) then
    raise exception '이 과제에 제출할 수 없어요 (수강생이 아니거나 마감이 지났어요)'
      using errcode = 'KH003';
  end if;

  if jsonb_typeof(files) is distinct from 'array' or jsonb_array_length(files) = 0 then
    raise exception '제출할 파일이 없어요' using errcode = 'KH004';
  end if;

  -- 모든 항목이 내 폴더에 실제로 올라간 서로 다른 객체이고 경로도 겹치지 않아야 한다.
  select count(*), count(o.metadata ->> 'size'),
         count(distinct f.storage_path), count(distinct f.path),
         coalesce(sum((o.metadata ->> 'size')::bigint), 0),
         coalesce(bool_and(left(f.storage_path, length(prefix)) = prefix), false)
  into file_count, found_count, distinct_objects, distinct_paths, total_size, in_my_folder
  from jsonb_to_recordset(files) as f(path text, storage_path text)
  left join storage.objects o
    on o.bucket_id = 'submissions' and o.name = f.storage_path;

  if found_count < file_count or not in_my_folder
    or distinct_objects < file_count or distinct_paths < file_count
  then
    raise exception '올리지 않았거나 겹치는 파일은 제출할 수 없어요' using errcode = 'KH004';
  end if;

  if total_size > 20971520 then
    raise exception '제출물은 20MB를 넘을 수 없어요' using errcode = 'KH005';
  end if;

  select submitted_at into previous_at
  from public.submission
  where assignment_id = target_assignment and student_id = me
  for update;

  insert into public.submission (assignment_id, student_id)
  values (target_assignment, me)
  on conflict (assignment_id, student_id) do update set submitted_at = now()
  returning id into target_submission;

  -- 이전 파일 묶음을 제출 이력으로 옮긴다.
  if exists (select 1 from public.submission_file where submission_id = target_submission) then
    insert into public.submission_history (submission_id, submitted_at)
    values (target_submission, coalesce(previous_at, now()))
    returning id into new_history;

    insert into public.submission_history_file (history_id, path, size, storage_path, kind)
    select new_history, path, size, storage_path, kind
    from public.submission_file
    where submission_id = target_submission;

    delete from public.submission_file where submission_id = target_submission;
  end if;

  insert into public.submission_file (submission_id, path, size, storage_path, kind)
  select target_submission, f.path, (o.metadata ->> 'size')::bigint, f.storage_path,
         coalesce(f.kind, 'binary')
  from jsonb_to_recordset(files) as f(path text, storage_path text, kind public.file_kind)
  join storage.objects o on o.bucket_id = 'submissions' and o.name = f.storage_path;

  -- 최근 history_keep개보다 오래된 이력을 지운다. 같은 문장의 select는 지우기 전 파일 목록을 본다.
  with doomed as (
    select id from public.submission_history
    where submission_id = target_submission
    order by submitted_at desc, id desc
    offset history_keep
  ), gone as (
    delete from public.submission_history h using doomed d where h.id = d.id
  )
  select coalesce(array_agg(distinct f.storage_path), '{}') into removed
  from public.submission_history_file f
  join doomed d on d.id = f.history_id;

  return array(select p from unnest(removed) p where not public.is_submitted_object(p));
end;
$$;

-- 마감 전에 내 제출물을 지운다. 제출 이력도 함께 지운다. 반환값: Storage에서 지울 storage_path
create or replace function public.delete_submission(target_assignment uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_submission uuid;
  removed text[];
begin
  if not public.can_submit(target_assignment) then
    raise exception '마감이 지나서 제출물을 지울 수 없어요' using errcode = 'KH003';
  end if;

  -- 같은 순간의 재제출이 파일 목록을 바꾸지 못하게 제출물을 먼저 잠근다.
  select id into target_submission
  from public.submission
  where assignment_id = target_assignment and student_id = (select auth.uid())
  for update;

  select array(
    select storage_path from public.submission_file where submission_id = target_submission
    union
    select f.storage_path
    from public.submission_history_file f
    join public.submission_history h on h.id = f.history_id
    where h.submission_id = target_submission
  ) into removed;

  -- 파일 목록과 제출 이력은 외래 키로 함께 지워진다.
  delete from public.submission where id = target_submission;

  return removed;
end;
$$;

-- 보관 ----------------------------------------------------------------------
-- 교수가 탈퇴해 과목이 보관될 때 제출 이력도 보관한다 (docs/adr/0003).

create table public.archived_submission_history (
  id uuid primary key,
  submission_id uuid not null references public.archived_submission (id) on delete cascade,
  submitted_at timestamptz not null
);

create table public.archived_submission_history_file (
  id uuid primary key,
  history_id uuid not null references public.archived_submission_history (id) on delete cascade,
  path text not null,
  size bigint not null,
  storage_path text not null,
  kind text not null
);

alter table public.archived_submission_history enable row level security;
alter table public.archived_submission_history_file enable row level security;
revoke all on public.archived_submission_history, public.archived_submission_history_file from anon, authenticated;

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

-- 탈퇴 준비: 제출 이력의 파일(보관된 것 포함)은 "올리는 중"으로 보지 않는다.
create or replace function public.prepare_withdrawal()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'submissions'
      and (storage.foldername(o.name))[2] = me::text
      and o.created_at > now() - interval '10 minutes'
      and not public.is_submitted_object(o.name)
      and not exists (select 1 from public.archived_submission_file f where f.storage_path = o.name)
      and not exists (select 1 from public.archived_submission_history_file f where f.storage_path = o.name)
  ) then
    raise exception '파일을 올리는 중이에요. 제출을 마친 뒤 다시 시도해 주세요.' using errcode = 'KH006';
  end if;

  return coalesce(
    (
      select array_agg(name order by name)
      from storage.objects
      where bucket_id = 'submissions' and (storage.foldername(name))[2] = me::text
    ),
    '{}'
  );
end;
$$;
