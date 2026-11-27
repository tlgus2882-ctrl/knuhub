-- 리뷰 배지 (#105)
--
-- 리뷰마다 쓴 사람의 "그 과목 안 역할"을 배지로 보인다. 배지는 저장하지 않고 읽을 때 계산하므로
-- 조교 지정을 바꾸면 배지도 바로 바뀐다.
--   professor: 그 과목의 담당 교수
--   assistant: 그 과목의 조교 (조교는 수강생이기도 하지만 조교가 앞선다)
--   student:   그 과목의 수강생
--   null:      그 과목 밖 사람 (학내 공개 제출물에 리뷰한 다른 과목 사람 등). 배지를 붙이지 않는다

create function public.review_author_role(review_author uuid, target_submission uuid)
returns text
language sql
stable
-- 조교 지정·수강 기록은 보는 사람에 따라 읽기가 막혀 있으므로, 역할 하나만 계산해 돌려준다.
security definer
set search_path = ''
as $$
  select case
    when c.professor_id = review_author then 'professor'
    when exists (select 1 from public.course_assistant ca where ca.course_id = c.id and ca.user_id = review_author) then 'assistant'
    when exists (select 1 from public.enrollment e where e.course_id = c.id and e.student_id = review_author) then 'student'
  end
  from public.submission s
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where s.id = target_submission;
$$;

-- PostgREST 계산 열: select("author_role"). 리뷰를 읽을 수 있는 사람(RLS)에게만 행이 오므로
-- 역할이 새어 나가지 않는다.
create function public.author_role(public.review)
returns text
language sql
stable
set search_path = ''
as $$
  select public.review_author_role($1.author_id, $1.submission_id);
$$;

revoke execute on function public.review_author_role(uuid, uuid), public.author_role(public.review) from public, anon;
grant execute on function public.review_author_role(uuid, uuid), public.author_role(public.review) to authenticated;
