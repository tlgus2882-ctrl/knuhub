-- zip·폴더 업로드 (#10)
--
-- 업로드 준비 단계(브라우저)가 파일마다 텍스트·바이너리를 정해 함께 보낸다.
-- 텍스트는 코드 뷰어로 보여 주고, 바이너리는 다운로드 링크만 준다 (#11).
create type public.file_kind as enum ('text', 'binary');

alter table public.submission_file
  add column kind public.file_kind not null default 'binary';

-- 올린 파일 묶음을 내 제출물로 확정한다. 이미 제출했다면 파일을 통째로 바꾼다 (덮어쓰기).
-- files: [{ "path": "src/main.py", "storage_path": "<assignment>/<me>/<attempt>/0", "kind": "text" }, ...]
-- kind를 빼면 바이너리로 본다 (다운로드만 가능).
-- 크기는 Storage에 실제로 올라간 객체에서 읽는다.
-- 반환값: 이번에 빠진 이전 파일의 storage_path. 호출한 쪽이 Storage에서 지운다.
create or replace function public.submit_files(target_assignment uuid, files jsonb)
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

  insert into public.submission (assignment_id, student_id)
  values (target_assignment, me)
  on conflict (assignment_id, student_id) do update set submitted_at = now()
  returning id into target_submission;

  -- 파일 목록을 통째로 바꾼다. 새 목록에 없는 이전 파일은 호출한 쪽이 Storage에서 지운다.
  with removed as (
    delete from public.submission_file
    where submission_id = target_submission
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into replaced
  from removed
  where storage_path not in (
    select f.storage_path from jsonb_to_recordset(files) as f(path text, storage_path text)
  );

  insert into public.submission_file (submission_id, path, size, storage_path, kind)
  select target_submission, f.path, (o.metadata ->> 'size')::bigint, f.storage_path,
         coalesce(f.kind, 'binary')
  from jsonb_to_recordset(files) as f(path text, storage_path text, kind public.file_kind)
  join storage.objects o on o.bucket_id = 'submissions' and o.name = f.storage_path;

  return replaced;
end;
$$;
