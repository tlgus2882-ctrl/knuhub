-- 검색 (#18)
--
-- 과목명, 과제명, 학생 이름·학번으로 찾는다. 코드 내용은 찾지 않는다.
-- security invoker라서 호출한 사용자의 RLS가 그대로 적용된다: 볼 수 없는 제출물은
-- 결과에 없고, 결과 수로도 존재가 드러나지 않는다 (docs/adr/0002).
-- 종류마다 최대 20개까지 돌려준다.
create function public.search(query text)
returns table (
  kind text,              -- 'course' | 'assignment' | 'submission'
  course_id uuid,
  assignment_id uuid,     -- 과제·제출물 결과일 때
  submission_id uuid,     -- 제출물 결과일 때
  title text,             -- 과목명 / 과제명 / 작성자 이름
  detail text,            -- 과제: 과목명 / 제출물: 학번 · 과제명 (과목은 null)
  semester text,          -- 과목 결과일 때 (화면이 학기·분반 표기를 만든다)
  section text
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
    select 'course', c.id, null::uuid, null::uuid, c.name, null, c.semester, c.section
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
    select 'assignment', a.course_id, a.id, null::uuid, a.title, c.name, null, null
    from public.assignment a
    join public.course c on c.id = a.course_id, pattern
    where a.title ilike pattern.p
    order by a.due_at desc, a.id
    limit 20
  )
  union all
  (
    select 'submission', a.course_id, s.assignment_id, s.id, p.name,
           coalesce(p.student_number || ' · ', '') || a.title, null, null
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
