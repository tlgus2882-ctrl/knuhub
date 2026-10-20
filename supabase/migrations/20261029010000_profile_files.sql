-- 프로필 파일 (v2, #55)
--
-- 과제와 상관없이 포트폴리오처럼 내 프로필에 올리는 파일. 로그인한 누구나 보고 내려받는다.
-- 브라우저가 {owner_id}/{파일 id} 이름으로 본인 폴더에 올리고 add_profile_file()이 확정한다.
-- 원래 파일 이름은 DB에만 둔다 (Storage 객체 이름에는 한글을 쓸 수 없다).
-- 파일당 20MB는 버킷 설정으로, 1인당 50MB는 add_profile_file()이 확인한다.
-- 탈퇴하면 행은 외래 키로, Storage 파일은 my_profile_file_objects() 목록대로 탈퇴 처리(withdrawUser)가 지운다.
--
-- 오류 코드: KH015 1인당 용량 초과, KH016 본인 폴더에 올라간 파일이 아님

insert into storage.buckets (id, name, public, file_size_limit)
values ('profile-files', 'profile-files', false, 20971520);

-- 한 사람의 프로필 파일 합계 한도 (바이트)
create function public.profile_files_limit()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 52428800::bigint;
$$;

create table public.profile_file (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profile (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 255),
  size bigint not null check (size >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index profile_file_owner_id_idx on public.profile_file (owner_id, created_at);

alter table public.profile_file enable row level security;

-- 올리기는 add_profile_file()로만 한다. 지우기는 본인 행만.
revoke all on public.profile_file from anon, authenticated;
grant select, delete on public.profile_file to authenticated;

create policy "로그인한 사용자는 프로필 파일 목록을 읽는다"
  on public.profile_file for select to authenticated using (true);

create policy "본인은 자기 프로필 파일을 지운다"
  on public.profile_file for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 프로필 파일로 등록된 Storage 객체인가 (정책 안에서 profile_file.name과 헷갈리지 않게 함수로 묻는다)
create function public.is_profile_file_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile_file where storage_path = object_name);
$$;

revoke execute on function public.is_profile_file_object(text) from public, anon;
grant execute on function public.is_profile_file_object(text) to authenticated;

-- 내 폴더에 이미 있는 Storage 객체(등록하지 않은 것 포함)의 개수와 합계
create function public.my_profile_folder_usage(out objects bigint, out bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), coalesce(sum((metadata ->> 'size')::bigint), 0)
  from storage.objects
  where bucket_id = 'profile-files' and split_part(name, '/', 1) = (select auth.uid())::text;
$$;

-- 부른 사람 자신의 폴더만 센다. Storage 정책이 그 사람 권한으로 부르므로 authenticated에 연다.
revoke execute on function public.my_profile_folder_usage() from public, anon;
grant execute on function public.my_profile_folder_usage() to authenticated;

-- {내 id}/{파일 id} 이름으로만 올린다 (하위 폴더 없음). 등록 전 파일도 쌓이지 않게, 폴더가 이미
-- 한도만큼 찼거나 파일이 100개면 더 받지 않는다 (새 파일 하나는 버킷이 20MB로 막는다).
create policy "본인 폴더에 프로필 파일을 올린다"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-files'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}$')
    and (select bytes < public.profile_files_limit() and objects < 100 from public.my_profile_folder_usage())
  );

-- 등록한 파일은 목록에서 먼저 지워야 Storage에서 지운다. 바로 지우고 같은 이름에 다시 올려
-- 등록된 크기와 다른 파일을 두는 것을 막는다.
create policy "본인 폴더의 등록하지 않은 프로필 파일을 지운다"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-files'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and not public.is_profile_file_object(name)
  );

-- 등록한 파일은 누구나, 아직 등록하지 않은 파일은 본인만 읽는다.
create policy "등록된 프로필 파일을 읽는다"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-files'
    and (split_part(name, '/', 1) = (select auth.uid())::text or public.is_profile_file_object(name))
  );

-- 올린 파일을 내 프로필 파일로 확정한다. 크기는 Storage에 실제로 올라간 객체에서 읽는다.
create function public.add_profile_file(storage_path text, file_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  object_size bigint;
  used bigint;
  added uuid;
begin
  select (o.metadata ->> 'size')::bigint into object_size
  from storage.objects o
  where o.bucket_id = 'profile-files'
    and o.name = add_profile_file.storage_path
    and split_part(o.name, '/', 1) = me::text;
  if me is null or object_size is null then
    raise exception '내 폴더에 올린 파일만 프로필에 둘 수 있어요' using errcode = 'KH016';
  end if;

  -- 같은 사람이 동시에 올려도 한도를 넘지 않게 그 사람 단위로 줄을 세운다.
  perform 1 from public.profile where id = me for update;
  select coalesce(sum(size), 0) into used from public.profile_file where owner_id = me;
  if used + object_size > public.profile_files_limit() then
    raise exception '프로필 파일 합계 한도를 넘어요' using errcode = 'KH015';
  end if;

  insert into public.profile_file (owner_id, name, size, storage_path)
  values (me, btrim(file_name), object_size, add_profile_file.storage_path)
  returning id into added;
  return added;
end;
$$;

revoke execute on function public.add_profile_file(text, text) from public, anon;
grant execute on function public.add_profile_file(text, text) to authenticated;

-- 탈퇴할 때 Storage에서 지울 내 프로필 파일 (등록하지 않은 것 포함). 탈퇴 처리가 이 목록대로 지운다.
create function public.my_profile_file_objects()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(name order by name), '{}')
  from storage.objects
  where bucket_id = 'profile-files' and split_part(name, '/', 1) = (select auth.uid())::text;
$$;

revoke execute on function public.my_profile_file_objects() from public, anon;
grant execute on function public.my_profile_file_objects() to authenticated;
