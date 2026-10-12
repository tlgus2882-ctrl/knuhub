-- 사용자 프로필과 가입 규칙 (#4)
-- 접근 규칙은 RLS와 DB 함수에만 둔다 (docs/adr/0002).

create type public.role as enum ('student', 'professor', 'admin');

-- 로그인한 사용자 누구나 볼 수 있는 정보 (작성자 카드에 쓰인다)
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
  privacy_consented_at timestamptz not null
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

create policy "로그인한 사용자는 프로필을 읽는다"
  on public.profile for select to authenticated
  using (true);

create policy "본인과 관리자만 전화번호를 읽는다"
  on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- 가입 화면이 "관리자에게 문의하세요"를 미리 안내하기 위한 확인 함수
create function public.student_number_taken(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile where student_number = candidate);
$$;

grant execute on function public.student_number_taken(text) to anon, authenticated;

-- 가입 규칙: 강남대 메일, 개인정보 수집 동의, 학번 중복 금지(unique 제약).
-- 어기면 auth.users 삽입 자체가 실패해 가입되지 않는다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if lower(new.email) not like '%@kangnam.ac.kr' then
    raise exception '강남대 메일(@kangnam.ac.kr)로만 가입할 수 있습니다';
  end if;

  if (meta ->> 'privacy_consent') is distinct from 'true' then
    raise exception '개인정보 수집에 동의해야 가입할 수 있습니다';
  end if;

  insert into public.profile (id, name, student_number)
  values (new.id, meta ->> 'name', nullif(btrim(meta ->> 'student_number'), ''));

  insert into public.profile_private (id, phone, privacy_consented_at)
  values (new.id, meta ->> 'phone', now());

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
