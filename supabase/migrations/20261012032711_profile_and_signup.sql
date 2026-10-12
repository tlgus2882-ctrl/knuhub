-- 사용자 프로필과 가입 규칙 (#4)
-- 접근 규칙은 RLS와 DB 함수에만 둔다 (docs/adr/0002).

create type public.role as enum ('student', 'professor', 'admin');

-- 로그인한 사용자 누구나 볼 수 있는 정보 (작성자 카드에 쓰인다).
-- student_number는 메일 인증을 마친 뒤에야 채워진다. 그래서 인증하지 않은
-- 가입은 학번을 차지하지 못하고, 같은 학번이면 먼저 인증한 사람이 갖는다.
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  student_number text unique check (student_number ~ '^[0-9]{6,12}$'),
  role public.role not null default 'student',
  created_at timestamptz not null default now()
);

-- 본인과 관리자만 볼 수 있는 정보
create table public.profile_private (
  id uuid primary key references public.profile (id) on delete cascade,
  phone text not null check (length(btrim(phone)) > 0),
  privacy_consented_at timestamptz not null,
  -- 메일 인증 전까지 맡아 두는 학번
  pending_student_number text check (pending_student_number ~ '^[0-9]{6,12}$')
);

alter table public.profile enable row level security;
alter table public.profile_private enable row level security;

-- 사용자는 프로필을 직접 만들거나 고칠 수 없다. 가입 트리거만 만든다.
-- 그래서 역할과 학번은 본인이 바꿀 수 없다. 관리자는 대시보드에서 바꾼다.
revoke all on public.profile, public.profile_private from anon, authenticated;
grant select on public.profile, public.profile_private to authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "로그인한 사용자는 프로필을 읽는다"
  on public.profile for select to authenticated
  using (true);

create policy "본인과 관리자만 전화번호를 읽는다"
  on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- 가입 화면이 "관리자에게 문의하세요"를 미리 안내하기 위한 확인 함수.
-- 로그인 전에 쓰므로 anon에게도 열어 둔다. 알 수 있는 건 인증을 마친
-- 사용자의 학번이 있는지 여부뿐이다.
create function public.student_number_taken(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile where student_number = candidate);
$$;

revoke execute on function public.student_number_taken(text) from public;
grant execute on function public.student_number_taken(text) to anon, authenticated;

create function public.assert_school_email(email text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(lower(email), '') not like '%@kangnam.ac.kr' then
    raise exception '강남대 메일(@kangnam.ac.kr)만 쓸 수 있습니다';
  end if;
end;
$$;

-- 가입 규칙: 강남대 메일, 개인정보 수집 동의, 이미 인증된 학번이면 거절.
-- 어기면 auth.users 삽입 자체가 실패해 가입되지 않는다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_student_number text := nullif(btrim(meta ->> 'student_number'), '');
begin
  perform public.assert_school_email(new.email);

  if (meta ->> 'privacy_consent') is distinct from 'true' then
    raise exception '개인정보 수집에 동의해야 가입할 수 있습니다';
  end if;

  if public.student_number_taken(wanted_student_number) then
    raise exception '이미 쓰인 학번입니다';
  end if;

  insert into public.profile (id, name, student_number)
  values (
    new.id,
    meta ->> 'name',
    case when new.email_confirmed_at is not null then wanted_student_number end
  );

  insert into public.profile_private (id, phone, privacy_consented_at, pending_student_number)
  values (
    new.id,
    meta ->> 'phone',
    now(),
    case when new.email_confirmed_at is null then wanted_student_number end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 메일 인증을 마치면 맡아 둔 학번을 프로필에 붙인다. 그사이 다른 사람이
-- 같은 학번으로 먼저 인증했다면 unique 제약에 걸려 인증이 실패한다.
create function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile p
  set student_number = pp.pending_student_number
  from public.profile_private pp
  where p.id = new.id and pp.id = new.id and pp.pending_student_number is not null;

  update public.profile_private
  set pending_student_number = null
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- 가입 후에도 메일은 강남대 주소여야 한다 (변경 요청과 변경 확정 모두).
create function public.guard_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_school_email(new.email);
  if coalesce(new.email_change, '') <> '' then
    perform public.assert_school_email(new.email_change);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_change
  before update of email, email_change on auth.users
  for each row execute function public.guard_email_change();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
revoke execute on function public.guard_email_change() from public, anon, authenticated;
revoke execute on function public.assert_school_email(text) from public, anon, authenticated;
