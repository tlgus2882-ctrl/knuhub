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
  github text check (github ~ '^[A-Za-z0-9](-?[A-Za-z0-9]){0,38}$'),
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

revoke execute on function public.shares_course_with(uuid) from public, anon;
grant execute on function public.shares_course_with(uuid) to authenticated;

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
