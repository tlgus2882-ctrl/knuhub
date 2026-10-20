-- 학생 프로필 확장과 프로필 검색 (v2, #54)
--
-- 프로필에 자기소개를 더한다. profile은 로그인한 누구나 읽고, 본인만 고친다 (기존 정책).
-- 탈퇴하면 profile과 함께 지워진다. 검색에 학생·교수 프로필 결과를 더한다.

alter table public.profile add column bio text not null default '' check (length(bio) <= 2000);

grant update (bio) on public.profile to authenticated;

-- 결과 열(user_id)이 늘어서 함수를 다시 만든다.
drop function public.search(text);

create function public.search(query text)
returns table (
  kind text,              -- 'profile' | 'course' | 'assignment' | 'submission'
  course_id uuid,
  assignment_id uuid,     -- 과제·제출물 결과일 때
  submission_id uuid,     -- 제출물 결과일 때
  title text,             -- 과목명 / 과제명 / 작성자 이름
  detail text,            -- 과제: 과목명 / 제출물: 학번 · 과제명 (과목은 null)
  semester text,          -- 과목 결과일 때 (화면이 학기·분반 표기를 만든다)
  section text,
  user_id uuid            -- 프로필 결과일 때
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pattern as (
    -- 입력한 % _ \ 는 글자 그대로 찾는다
    select '%' || replace(replace(replace(btrim(query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
    where btrim(query) <> ''
  )
  (
    -- 학생과 교수의 프로필 (관리자는 운영자라서 찾지 않는다)
    select 'profile', null::uuid, null::uuid, null::uuid, p.name,
           case when p.role = 'professor' then '교수' else coalesce(p.student_number, '학번 없음') end, null, null, p.id
    from public.profile p, pattern
    where p.role in ('student', 'professor') and (p.name ilike pattern.p or p.student_number like pattern.p)
    order by p.name, p.id
    limit 20
  )
  union all
  (
    select 'course', c.id, null::uuid, null::uuid, c.name, null, c.semester, c.section, null::uuid
    from public.course c, pattern
    where c.name ilike pattern.p
    -- 최신 학기부터: 같은 해 안에서는 겨울 → 2 → 여름 → 1 (화면의 compareSemestersNewestFirst와 같다)
    order by split_part(c.semester, '-', 1) desc,
             array_position(array['겨울', '2', '여름', '1'], split_part(c.semester, '-', 2)) nulls last,
             c.name, c.section, c.id
    limit 20
  )
  union all
  (
    select 'assignment', a.course_id, a.id, null::uuid, a.title, c.name, null, null, null::uuid
    from public.assignment a
    join public.course c on c.id = a.course_id, pattern
    where a.title ilike pattern.p
    order by a.due_at desc, a.id
    limit 20
  )
  union all
  (
    select 'submission', a.course_id, s.assignment_id, s.id, p.name,
           coalesce(p.student_number || ' · ', '') || a.title, null, null, null::uuid
    from public.submission s
    join public.profile p on p.id = s.student_id
    join public.assignment a on a.id = s.assignment_id, pattern
    where p.name ilike pattern.p or p.student_number like pattern.p
    order by s.submitted_at desc, s.id
    limit 20
  );
$$;

revoke execute on function public.search(text) from public, anon;
grant execute on function public.search(text) to authenticated;
