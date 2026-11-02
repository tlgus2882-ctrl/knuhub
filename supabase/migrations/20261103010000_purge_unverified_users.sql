-- 메일 인증 안 한 사용자 정리
--
-- 가입하고 학교 메일 인증을 24시간 안에 하지 않은 사용자는 지운다. 인증 전에는 로그인할 수 없어서
-- 남길 데이터가 없고, 지우면 그 사용자가 맡아 둔 학번도 풀린다. pg_cron이 1시간마다 부른다.
-- 관리자 페이지의 사용자 목록에는 메일 인증 시각을 함께 보여 준다.

create extension if not exists pg_cron;

-- 지울 대상: 메일 인증을 하지 않고 max_age보다 오래된 사용자 (관리자는 빼고)
create function public.unverified_users_to_purge(max_age interval)
returns table (id uuid, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.created_at
  from auth.users u
  left join public.profile p on p.id = u.id
  where u.email_confirmed_at is null
    and u.created_at < now() - max_age
    and coalesce(p.role, 'student') <> 'admin';
$$;

-- 메일 인증 안 하고 24시간이 지난 사용자를 지운다. 반환값: 지운 사람 수.
-- auth.users를 지우면 profile과 그에 딸린 행이 외래 키로 함께 지워진다.
create function public.purge_unverified_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users u
  using public.unverified_users_to_purge(interval '24 hours') t
  where u.id = t.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- 사람이 부르는 함수가 아니다: pg_cron(postgres)과 서버의 secret key(service_role)만 부른다.
revoke execute on function public.unverified_users_to_purge(interval), public.purge_unverified_users()
  from public, anon, authenticated;
grant execute on function public.unverified_users_to_purge(interval), public.purge_unverified_users() to service_role;

select cron.schedule('purge-unverified-users', '0 * * * *', 'select public.purge_unverified_users()');

-- 사용자 목록에 메일 인증 시각(email_confirmed_at, 인증 전이면 null)을 더한다. 반환 열이 늘어서 다시 만든다.
drop function public.admin_list_users(text);

create function public.admin_list_users(query text)
returns table (
  id uuid,
  name text,
  student_number text,
  email text,
  role public.role,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text := '%' || replace(replace(replace(coalesce(btrim(query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.assert_admin();
  return query
  select p.id, p.name, p.student_number, u.email::text, p.role, p.created_at, u.email_confirmed_at
  from public.profile p
  join auth.users u on u.id = p.id
  where p.name ilike pattern or p.student_number ilike pattern or u.email ilike pattern
  order by p.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;
