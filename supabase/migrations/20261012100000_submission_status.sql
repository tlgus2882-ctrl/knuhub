-- 제출 현황 표 (#15)
--
-- 과제마다 수강생 전체의 제출 여부와 제출 시각. 미제출자도 나온다.
-- 조교는 수강 관계를 직접 읽을 수 없으므로 담당 교수·조교 확인을 거친 함수로 준다.
create function public.submission_status(target_assignment uuid)
returns table (
  student_id uuid,
  name text,
  student_number text,
  submission_id uuid,
  -- 마지막으로 제출하거나 다시 제출한 시각. 미제출이면 null
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_course uuid;
begin
  select course_id into target_course from public.assignment where id = target_assignment;

  if target_course is null or not public.is_professor_or_assistant(target_course) then
    raise exception '담당 교수와 조교만 제출 현황을 볼 수 있습니다' using errcode = '42501';
  end if;

  return query
    select e.student_id, p.name, p.student_number, s.id, s.submitted_at
    from public.enrollment e
    join public.profile p on p.id = e.student_id
    left join public.submission s
      on s.assignment_id = target_assignment and s.student_id = e.student_id
    where e.course_id = target_course
    order by p.student_number nulls last, p.name;
end;
$$;

revoke execute on function public.submission_status(uuid) from public, anon;
grant execute on function public.submission_status(uuid) to authenticated;
