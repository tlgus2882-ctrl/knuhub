-- 점수 이의신청
--
-- 마감이 지나고 채점 완료된 공개 과제에 그 과목 수강생이 점수에 대한 이의신청을 과제마다 하나 남긴다.
-- 점수는 이 사이트에 없으니 이의신청은 글로 남기고, 담당 교수·조교가 읽고 답변한다.
-- 신청한 학생과 담당 교수·조교만 읽는다. 답변하기 전에는 학생이 신청을 거둘 수 있다.
-- 탈퇴하면 그 학생의 이의신청은 외래 키로 지워지고, 답변한 사람이 탈퇴해도 답변은 남는다.

create table public.grade_appeal (
  assignment_id uuid not null references public.assignment (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  body text not null check (body ~ '[^[:space:]]' and length(body) <= 2000),
  created_at timestamptz not null default now(),
  answer text check (answer ~ '[^[:space:]]' and length(answer) <= 2000),
  answered_by uuid references public.profile (id) on delete set null,
  answered_at timestamptz,
  primary key (assignment_id, student_id)
);

alter table public.grade_appeal enable row level security;

revoke all on public.grade_appeal from anon, authenticated;
grant select, delete on public.grade_appeal to authenticated;
grant insert (assignment_id, body) on public.grade_appeal to authenticated;
-- 답변은 담당 교수·조교만 (정책이 막는다). 누가 언제 답했는지는 트리거가 채운다.
grant update (answer) on public.grade_appeal to authenticated;

-- 이 과제의 담당 교수나 조교인가
create function public.is_assignment_staff(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment and public.is_professor_or_assistant(course_id)
  );
$$;

revoke execute on function public.is_assignment_staff(uuid) from public, anon;
grant execute on function public.is_assignment_staff(uuid) to authenticated;

-- 지금 이 과제에 이의신청할 수 있는가: 마감이 지나고 채점 완료된 공개 과제이고 내가 그 과목 수강생일 때
create function public.can_appeal(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignment
    where id = target_assignment
      and published
      and public.is_enrolled(course_id)
      and now() >= due_at
      and graded_at is not null
  );
$$;

revoke execute on function public.can_appeal(uuid) from public, anon;
grant execute on function public.can_appeal(uuid) to authenticated;

create policy "신청한 학생과 담당 교수·조교는 이의신청을 읽는다"
  on public.grade_appeal for select to authenticated
  using (student_id = (select auth.uid()) or public.is_assignment_staff(assignment_id));

create policy "수강생은 채점 완료 후 이의신청을 한다"
  on public.grade_appeal for insert to authenticated
  with check (student_id = (select auth.uid()) and public.can_appeal(assignment_id));

create policy "담당 교수·조교는 이의신청에 답변한다"
  on public.grade_appeal for update to authenticated
  using (public.is_assignment_staff(assignment_id))
  with check (public.is_assignment_staff(assignment_id));

create policy "학생은 답변 전 자기 이의신청을 거둔다"
  on public.grade_appeal for delete to authenticated
  using (student_id = (select auth.uid()) and answer is null);

create function public.stamp_grade_appeal_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.answered_by := (select auth.uid());
  new.answered_at := now();
  return new;
end;
$$;

create trigger grade_appeal_stamp_answer
  before update of answer on public.grade_appeal
  for each row execute function public.stamp_grade_appeal_answer();
