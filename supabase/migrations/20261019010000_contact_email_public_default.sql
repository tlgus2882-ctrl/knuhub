-- 학교 메일은 기본으로 전체에 공개
--
-- 연락처를 저장한 적 없는 사용자(profile_contact 행이 없음)도, 저장하면서 따로 정하지 않은
-- 사용자도 학교 메일을 보이고 연락처 공개 범위는 전체다. 본인이 이미 저장한 설정은 그대로 둔다.
alter table public.profile_contact
  alter column show_email set default true,
  alter column contact_visibility set default 'public';

-- 행이 없으면 위 기본값을 쓴다.
create or replace function public.author_contacts(target uuid)
returns table (email text, open_chat_url text, github text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when coalesce(c.show_email, true) then u.email::text end,
    c.open_chat_url,
    c.github
  from public.profile p
  join auth.users u on u.id = p.id
  left join public.profile_contact c on c.id = p.id
  where p.id = target
    and (
      p.id = (select auth.uid())
      or coalesce(c.contact_visibility, 'public') = 'public'
      or (c.contact_visibility = 'course' and public.shares_course_with(p.id))
    );
$$;
