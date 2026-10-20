-- 교수 추천 (v2, #59)
--
-- 제출물마다 표시 하나다. 그 과목의 담당 교수·조교만 붙이고 뗀다.
-- 표시는 그 제출물을 볼 수 있는 사람에게 보인다. 사이트 오른쪽의 최근 추천 목록은
-- 일주일 안에 붙은 추천만 보여 준다 (표시 자체는 그대로 남는다).

create table public.recommendation (
  submission_id uuid primary key references public.submission (id) on delete cascade,
  -- 붙인 조교가 탈퇴해도 추천은 남는다
  recommended_by uuid default auth.uid() references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

create index recommendation_created_at_idx on public.recommendation (created_at desc);

alter table public.recommendation enable row level security;

revoke all on public.recommendation from anon, authenticated;
grant select, delete on public.recommendation to authenticated;
grant insert (submission_id) on public.recommendation to authenticated;

-- 이 제출물이 속한 과목의 담당 교수나 조교인가
create function public.is_submission_course_staff(target_submission uuid)
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
    where s.id = target_submission and public.is_professor_or_assistant(a.course_id)
  );
$$;

revoke execute on function public.is_submission_course_staff(uuid) from public, anon;
grant execute on function public.is_submission_course_staff(uuid) to authenticated;

create policy "볼 수 있는 제출물의 추천 표시를 읽는다"
  on public.recommendation for select to authenticated
  using (public.can_view_submission(submission_id));

create policy "담당 교수·조교는 추천을 붙인다"
  on public.recommendation for insert to authenticated
  with check (recommended_by = (select auth.uid()) and public.is_submission_course_staff(submission_id));

create policy "담당 교수·조교는 추천을 뗀다"
  on public.recommendation for delete to authenticated
  using (public.is_submission_course_staff(submission_id));

-- 최근 일주일 안의 추천 중 내가 볼 수 있는 것 (최신순, 20개까지).
-- security invoker라서 제출물 열람 규칙(RLS)이 그대로 걸린다.
create function public.recent_recommendations()
returns table (
  submission_id uuid,
  course_id uuid,
  assignment_id uuid,
  assignment_title text,
  course_name text,
  student_name text,
  recommended_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.submission_id, a.course_id, a.id, a.title, c.name, p.name, r.created_at
  from public.recommendation r
  join public.submission s on s.id = r.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  join public.profile p on p.id = s.student_id
  where r.created_at > now() - interval '7 days'
  order by r.created_at desc
  limit 20;
$$;

revoke execute on function public.recent_recommendations() from public, anon;
grant execute on function public.recent_recommendations() to authenticated;
