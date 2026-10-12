-- 과제 공지 (#8)

-- 공개 범위: 마감 후 제출물을 누가 볼 수 있는지 (GLOSSARY.md)
create type public.visibility as enum ('private', 'course', 'campus');

create table public.assignment (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.course (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  -- 마크다운. 채점 기준표도 여기에 자유 텍스트로 쓴다.
  description text not null default '',
  due_at timestamptz not null,
  visibility public.visibility not null default 'course',
  -- 작성자가 탈퇴해도 과제는 남는다.
  created_by uuid default auth.uid() references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignment_course_id_idx on public.assignment (course_id, due_at);

alter table public.assignment enable row level security;

-- 과제는 만든 뒤 다른 과목으로 옮길 수 없다 (course_id는 수정 권한에서 뺀다).
revoke all on public.assignment from anon, authenticated;
grant select on public.assignment to authenticated;
grant insert (course_id, title, description, due_at, visibility) on public.assignment to authenticated;
grant update (title, description, due_at, visibility) on public.assignment to authenticated;

-- 담당 교수 또는 그 과목의 조교
create function public.is_course_staff(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_course_professor(target_course)
    or exists (
      select 1 from public.course_assistant
      where course_id = target_course and user_id = (select auth.uid())
    );
$$;

revoke execute on function public.is_course_staff(uuid) from public, anon;
grant execute on function public.is_course_staff(uuid) to authenticated;

-- 과제 목록은 로그인한 누구나 본다 (학기 → 과목 → 과제 탐색, #15).
-- 제출물을 누가 보는지는 공개 범위와 마감일이 따로 정한다 (#9, #12).
create policy "로그인한 사용자는 과제를 읽는다"
  on public.assignment for select to authenticated
  using (true);

create policy "담당 교수와 조교는 과제를 만든다"
  on public.assignment for insert to authenticated
  with check (public.is_course_staff(course_id));

create policy "담당 교수와 조교는 과제를 고친다"
  on public.assignment for update to authenticated
  using (public.is_course_staff(course_id))
  with check (public.is_course_staff(course_id));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger assignment_touch_updated_at
  before update on public.assignment
  for each row execute function public.touch_updated_at();

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
