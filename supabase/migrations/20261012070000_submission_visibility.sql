-- 제출물 열람 규칙 완성 (#12)
--
-- 공개 여부는 저장하지 않고 항상 현재 마감일과 현재 시각으로 계산한다.
-- 그래서 공개 범위를 바꾸면 바로 반영되고, 마감을 연장하면 다시 숨겨진다.
-- Storage의 파일 읽기도 can_read_submission_object()를 거쳐 이 함수를 따른다.
create or replace function public.can_view_submission(target_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submission s
    join public.assignment a on a.id = s.assignment_id
    where s.id = target_submission
      and (
        -- 작성자 본인
        s.student_id = (select auth.uid())
        -- 그 과목의 담당 교수·조교는 마감 전에도 본다
        or public.is_professor_or_assistant(a.course_id)
        -- 마감 후에는 공개 범위에 따라
        or (
          now() >= a.due_at
          and (
            a.visibility = 'campus'
            or (
              a.visibility = 'course'
              and exists (
                select 1 from public.enrollment e
                where e.course_id = a.course_id and e.student_id = (select auth.uid())
              )
            )
          )
        )
      )
  );
$$;
