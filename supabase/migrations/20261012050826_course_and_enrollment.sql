-- 과목 개설과 초대 코드 참여 (#6)

-- 과목: 학기와 분반까지 포함한 개설 강좌 하나 (GLOSSARY.md)
create table public.course (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  semester text not null check (length(btrim(semester)) > 0),
  section text not null check (length(btrim(section)) > 0),
  professor_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (name, semester, section)
);

-- 초대 코드는 과목 목록과 따로 둔다. 과목 목록은 로그인한 누구나 보지만
-- 초대 코드는 담당 교수만 봐야 한다.
create table public.course_invite (
  course_id uuid primary key references public.course (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$')
);

-- 수강생: 초대 코드로 과목에 참여한 학생
create table public.enrollment (
  course_id uuid not null references public.course (id) on delete cascade,
  student_id uuid not null references public.profile (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

alter table public.course enable row level security;
alter table public.course_invite enable row level security;
alter table public.enrollment enable row level security;

revoke all on public.course, public.course_invite, public.enrollment from anon, authenticated;
grant select on public.course, public.course_invite, public.enrollment to authenticated;
grant insert (name, semester, section, professor_id) on public.course to authenticated;

create function public.is_professor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile
    where id = (select auth.uid()) and role = 'professor'
  );
$$;

revoke execute on function public.is_professor() from public, anon;
grant execute on function public.is_professor() to authenticated;

create policy "로그인한 사용자는 과목을 읽는다"
  on public.course for select to authenticated
  using (true);

create policy "교수는 자기를 담당 교수로 과목을 연다"
  on public.course for insert to authenticated
  with check (public.is_professor() and professor_id = (select auth.uid()));

create policy "담당 교수만 초대 코드를 읽는다"
  on public.course_invite for select to authenticated
  using (
    exists (
      select 1 from public.course c
      where c.id = course_id and c.professor_id = (select auth.uid())
    )
  );

create policy "학생은 자기 수강 기록을 읽는다"
  on public.enrollment for select to authenticated
  using (student_id = (select auth.uid()));

create function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- 과목이 열리면 초대 코드를 발급한다.
create function public.handle_new_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.course_invite (course_id, invite_code)
  values (new.id, public.new_invite_code());
  return new;
end;
$$;

create trigger on_course_created
  after insert on public.course
  for each row execute function public.handle_new_course();

-- 학생이 초대 코드로 과목에 참여한다. 승인 없이 바로 수강생이 되고,
-- 이미 수강생이면 그대로 둔다. 참여한 과목의 id를 돌려준다.
create function public.join_course(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not exists (
    select 1 from public.profile where id = (select auth.uid()) and role = 'student'
  ) then
    raise exception '학생만 초대 코드로 과목에 참여할 수 있습니다';
  end if;

  select course_id into target
  from public.course_invite
  where invite_code = upper(btrim(code));

  if target is null then
    raise exception '초대 코드가 맞지 않습니다';
  end if;

  insert into public.enrollment (course_id, student_id)
  values (target, (select auth.uid()))
  on conflict do nothing;

  return target;
end;
$$;

revoke execute on function public.join_course(text) from public, anon;
grant execute on function public.join_course(text) to authenticated;
revoke execute on function public.handle_new_course() from public, anon, authenticated;
revoke execute on function public.new_invite_code() from public, anon, authenticated;
