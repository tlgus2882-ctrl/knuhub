-- 연락처와 프로필 수정 (#14)

-- 이름은 본인이 고친다. 학번·역할은 여전히 못 고치고, 전화번호(profile_private)도 그대로 읽기만 한다.
grant update (name) on public.profile to authenticated;

create policy "본인은 자기 이름을 고친다"
  on public.profile for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 연락처 공개 범위 (GLOSSARY.md)
create type public.contact_visibility as enum ('public', 'course', 'private');

-- 연락 수단. profile은 누구나 읽으므로 따로 두고, 본인만 직접 읽고 쓴다.
-- 다른 사람에게는 author_contacts()가 공개 범위에 맞는 것만 내준다.
create table public.profile_contact (
  id uuid primary key references public.profile (id) on delete cascade,
  -- 학교 메일(가입 메일)을 연락 수단으로 보일지
  show_email boolean not null default false,
  open_chat_url text check (open_chat_url ~ '^https://open\.kakao\.com/[A-Za-z0-9/_-]+$'),
  -- GitHub 아이디 규칙: 영문·숫자·하이픈, 하이픈으로 시작·끝나거나 연달아 쓸 수 없고 39자까지
  github text check (github ~ '^[A-Za-z0-9](-?[A-Za-z0-9]){0,38}$' and length(github) <= 39),
  contact_visibility public.contact_visibility not null default 'private'
);

alter table public.profile_contact enable row level security;

revoke all on public.profile_contact from anon, authenticated;
grant select, insert, update on public.profile_contact to authenticated;

create policy "본인만 연락처 설정을 읽는다"
  on public.profile_contact for select to authenticated
  using (id = (select auth.uid()));

create policy "본인만 연락처를 등록한다"
  on public.profile_contact for insert to authenticated
  with check (id = (select auth.uid()));

create policy "본인만 연락처를 고친다"
  on public.profile_contact for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 두 사용자가 같은 과목에 있는가 (수강생이든 담당 교수든, 조교는 수강생이기도 하다)
create function public.shares_course_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select course_id, student_id as user_id from public.enrollment
    union all
    select id, professor_id from public.course
  )
  select exists (
    select 1
    from members mine
    join members theirs on theirs.course_id = mine.course_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

-- 직접 부르면 아무 사용자 id로 같은 과목인지 떠볼 수 있으므로 author_contacts()만 쓴다.
revoke execute on function public.shares_course_with(uuid) from public, anon, authenticated;

-- 작성자 카드에 보일 연락 수단. 공개 범위가 허용하지 않으면 행이 없다.
-- 전체: 모든 사용자 / 수강생: 같은 과목 수강생·교수·조교 / 비공개: 본인만
create function public.author_contacts(target uuid)
returns table (email text, open_chat_url text, github text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when c.show_email then u.email::text end,
    c.open_chat_url,
    c.github
  from public.profile_contact c
  join auth.users u on u.id = c.id
  where c.id = target
    and (
      c.id = (select auth.uid())
      or c.contact_visibility = 'public'
      or (c.contact_visibility = 'course' and public.shares_course_with(c.id))
    );
$$;

revoke execute on function public.author_contacts(uuid) from public, anon;
grant execute on function public.author_contacts(uuid) to authenticated;

-- 프로필 화면의 저장: 이름과 연락 수단을 한 번에(한 트랜잭션으로) 바꾼다.
-- 권한은 호출한 사용자의 것(security invoker)이라 위의 RLS와 열 권한이 그대로 적용된다.
create function public.update_my_profile(
  new_name text,
  show_email boolean,
  contact_visibility public.contact_visibility,
  -- 비워 두면(null) 그 연락 수단을 지운다
  open_chat_url text default null,
  github text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.profile set name = new_name where id = (select auth.uid());

  insert into public.profile_contact (id, show_email, open_chat_url, github, contact_visibility)
  values ((select auth.uid()), show_email, open_chat_url, github, contact_visibility)
  on conflict (id) do update set
    show_email = excluded.show_email,
    open_chat_url = excluded.open_chat_url,
    github = excluded.github,
    contact_visibility = excluded.contact_visibility;
end;
$$;

revoke execute on function public.update_my_profile(text, boolean, public.contact_visibility, text, text) from public, anon;
grant execute on function public.update_my_profile(text, boolean, public.contact_visibility, text, text) to authenticated;
