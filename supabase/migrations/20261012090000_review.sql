-- 리뷰 (#13)
--
-- 제출물을 볼 수 있는 사람은 누구나 리뷰를 쓴다. 리뷰는 제출물과 같은 열람 규칙을
-- 따르므로, 마감 전 교수·조교가 남긴 리뷰는 제출물이 공개될 때 함께 보인다.
create table public.review (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submission (id) on delete cascade,
  -- 탈퇴하면 리뷰도 지운다 (스펙: 탈퇴 시 프로필, 제출물, 리뷰 삭제)
  author_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_submission_id_idx on public.review (submission_id, created_at);

alter table public.review enable row level security;

-- 작성자는 항상 나 자신(author_id 기본값). 고칠 수 있는 건 본문뿐이다.
revoke all on public.review from anon, authenticated;
grant select, delete on public.review to authenticated;
grant insert (submission_id, body) on public.review to authenticated;
grant update (body) on public.review to authenticated;

-- 이 제출물이 속한 과목의 담당 교수인가
create function public.is_submission_course_professor(target_submission uuid)
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
    where s.id = target_submission and public.is_course_professor(a.course_id)
  );
$$;

revoke execute on function public.is_submission_course_professor(uuid) from public, anon;
grant execute on function public.is_submission_course_professor(uuid) to authenticated;

-- 자기 리뷰는 제출물이 다시 숨겨져도 보여야 고치거나 지울 수 있다.
create policy "제출물을 볼 수 있으면 리뷰도 읽는다"
  on public.review for select to authenticated
  using (public.can_view_submission(submission_id) or author_id = (select auth.uid()));

create policy "볼 수 있는 제출물에 내 이름으로 리뷰를 쓴다"
  on public.review for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_submission(submission_id));

create policy "리뷰 작성자는 언제든 고친다"
  on public.review for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "리뷰 작성자와 담당 교수는 지운다"
  on public.review for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_submission_course_professor(submission_id));

create trigger review_touch_updated_at
  before update on public.review
  for each row execute function public.touch_updated_at();
