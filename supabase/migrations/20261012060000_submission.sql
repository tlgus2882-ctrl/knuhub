-- 파일 하나 제출 (#9)
--
-- 제출물 메타데이터는 DB에, 파일은 Storage의 submissions 버킷에 둔다.
-- 브라우저가 파일을 {assignment_id}/{student_id}/{attempt}/{번호} 이름으로 올리고,
-- submit_files()가 그 묶음을 제출물로 확정한다. 원래 파일 경로는 DB에만 둔다
-- (Storage 객체 이름에는 한글 파일명을 쓸 수 없다).

insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 20971520);

-- 학생·과제당 하나 (GLOSSARY.md 제출물)
create table public.submission (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  student_id uuid not null references public.profile (id) on delete cascade,
  -- 마지막으로 제출하거나 재제출한 시각
  submitted_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table public.submission_file (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submission (id) on delete cascade,
  -- 제출한 사람이 본 경로 (폴더 포함 가능)
  path text not null check (length(path) between 1 and 1024),
  size bigint not null check (size >= 0),
  storage_path text not null unique,
  unique (submission_id, path)
);

create index submission_file_submission_id_idx on public.submission_file (submission_id);

alter table public.submission enable row level security;
alter table public.submission_file enable row level security;

-- 쓰기는 submit_files()와 delete_submission()으로만 한다.
revoke all on public.submission, public.submission_file from anon, authenticated;
grant select on public.submission, public.submission_file to authenticated;

-- 이 제출물을 볼 수 있는가. 마감 후 공개 범위와 교수·조교 열람은 #12에서 넓힌다.
create function public.can_view_submission(target_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submission
    where id = target_submission and student_id = (select auth.uid())
  );
$$;

revoke execute on function public.can_view_submission(uuid) from public, anon;
grant execute on function public.can_view_submission(uuid) to authenticated;

create policy "볼 수 있는 제출물을 읽는다"
  on public.submission for select to authenticated
  using (public.can_view_submission(id));

create policy "볼 수 있는 제출물의 파일 목록을 읽는다"
  on public.submission_file for select to authenticated
  using (public.can_view_submission(submission_id));

-- 지금 이 과제에 제출할 수 있는가: 그 과목의 수강생이고 현재 마감일 전
create function public.can_submit(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignment a
    join public.enrollment e on e.course_id = a.course_id
    where a.id = target_assignment
      and e.student_id = (select auth.uid())
      and now() < a.due_at
  );
$$;

revoke execute on function public.can_submit(uuid) from public, anon;
grant execute on function public.can_submit(uuid) to authenticated;

-- Storage 객체 이름이 내 제출 폴더({assignment_id}/{내 id}/...)이고 지금 제출할 수 있는가
create function public.can_write_submission_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(object_name, '/');
begin
  if array_length(parts, 1) < 3
    or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or parts[2] <> (select auth.uid())::text
  then
    return false;
  end if;
  return public.can_submit(parts[1]::uuid);
end;
$$;

revoke execute on function public.can_write_submission_object(text) from public, anon;
grant execute on function public.can_write_submission_object(text) to authenticated;

-- 제출물에 속한 객체이고 그 제출물을 볼 수 있는가
create function public.can_read_submission_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submission_file
    where storage_path = object_name and public.can_view_submission(submission_id)
  );
$$;

revoke execute on function public.can_read_submission_object(text) from public, anon;
grant execute on function public.can_read_submission_object(text) to authenticated;

create policy "수강생은 마감 전에 자기 제출 폴더에 올린다"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.can_write_submission_object(name));

create policy "수강생은 마감 전에 자기 제출 폴더에서 지운다"
  on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and public.can_write_submission_object(name));

-- Storage는 지울 때도 읽기 권한을 확인하므로, 지울 수 있는 객체는 읽을 수도 있다.
create policy "볼 수 있는 제출물의 파일을 읽는다"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (public.can_read_submission_object(name) or public.can_write_submission_object(name))
  );

-- 올린 파일 묶음을 내 제출물로 확정한다. 이미 제출했다면 파일을 통째로 바꾼다 (덮어쓰기).
-- files: [{ "path": "src/main.py", "storage_path": "<assignment>/<me>/<attempt>/0" }, ...]
-- 크기는 Storage에 실제로 올라간 객체에서 읽는다.
-- 반환값: 이번에 빠진 이전 파일의 storage_path. 호출한 쪽이 Storage에서 지운다.
create function public.submit_files(target_assignment uuid, files jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  prefix text := target_assignment::text || '/' || me::text || '/';
  target_submission uuid;
  replaced text[];
  file_count int;
  found_count int;
  total_size bigint;
  in_my_folder boolean;
begin
  if not public.can_submit(target_assignment) then
    raise exception '이 과제에 제출할 수 없어요 (수강생이 아니거나 마감이 지났어요)'
      using errcode = '42501';
  end if;

  if jsonb_typeof(files) is distinct from 'array' or jsonb_array_length(files) = 0 then
    raise exception '제출할 파일이 없어요' using errcode = '22023';
  end if;

  select count(*), count(o.name), coalesce(sum((o.metadata ->> 'size')::bigint), 0),
         coalesce(bool_and(left(f.storage_path, length(prefix)) = prefix), false)
  into file_count, found_count, total_size, in_my_folder
  from jsonb_to_recordset(files) as f(path text, storage_path text)
  left join storage.objects o
    on o.bucket_id = 'submissions' and o.name = f.storage_path;

  if found_count < file_count or not in_my_folder then
    raise exception '올리지 않은 파일은 제출할 수 없어요' using errcode = '22023';
  end if;

  if total_size > 20971520 then
    raise exception '제출물은 20MB를 넘을 수 없어요' using errcode = '22023';
  end if;

  insert into public.submission (assignment_id, student_id)
  values (target_assignment, me)
  on conflict (assignment_id, student_id) do update set submitted_at = now()
  returning id into target_submission;

  with removed as (
    delete from public.submission_file
    where submission_id = target_submission
      and storage_path not in (
        select f.storage_path from jsonb_to_recordset(files) as f(path text, storage_path text)
      )
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into replaced from removed;

  insert into public.submission_file (submission_id, path, size, storage_path)
  select target_submission, f.path, (o.metadata ->> 'size')::bigint, f.storage_path
  from jsonb_to_recordset(files) as f(path text, storage_path text)
  join storage.objects o on o.bucket_id = 'submissions' and o.name = f.storage_path
  on conflict (storage_path) do nothing;

  return replaced;
end;
$$;

revoke execute on function public.submit_files(uuid, jsonb) from public, anon;
grant execute on function public.submit_files(uuid, jsonb) to authenticated;

-- 마감 전에 내 제출물을 지운다. 반환값: Storage에서 지울 storage_path
create function public.delete_submission(target_assignment uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed text[];
begin
  if not public.can_submit(target_assignment) then
    raise exception '마감이 지나서 제출물을 지울 수 없어요' using errcode = '42501';
  end if;

  select coalesce(array_agg(f.storage_path), '{}') into removed
  from public.submission s
  join public.submission_file f on f.submission_id = s.id
  where s.assignment_id = target_assignment and s.student_id = (select auth.uid());

  delete from public.submission
  where assignment_id = target_assignment and student_id = (select auth.uid());

  return removed;
end;
$$;

revoke execute on function public.delete_submission(uuid) from public, anon;
grant execute on function public.delete_submission(uuid) to authenticated;
