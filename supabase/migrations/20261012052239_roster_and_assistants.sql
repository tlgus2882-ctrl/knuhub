-- 수강생 명단과 조교 지정 (#7)

create function public.is_course_professor(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course
    where id = target_course and professor_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_course_professor(uuid) from public, anon;
grant execute on function public.is_course_professor(uuid) to authenticated;

-- 담당 교수는 자기 과목의 수강 기록을 읽고, 수강생을 내보낼 수 있다.
-- (지울 행은 읽기 정책으로도 보여야 지워진다.)
grant delete on public.enrollment to authenticated;

create policy "담당 교수는 자기 과목의 수강 기록을 읽는다"
  on public.enrollment for select to authenticated
  using (public.is_course_professor(course_id));

create policy "담당 교수는 수강생을 내보낸다"
  on public.enrollment for delete to authenticated
  using (public.is_course_professor(course_id));

-- 조교: 특정 과목 안에서만 갖는 역할. 그 과목의 수강생만 될 수 있고,
-- 수강생에서 빠지면 조교에서도 빠진다.
create table public.course_assistant (
  course_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id),
  foreign key (course_id, user_id)
    references public.enrollment (course_id, student_id) on delete cascade
);

alter table public.course_assistant enable row level security;

revoke all on public.course_assistant from anon, authenticated;
grant select, insert (course_id, user_id), delete on public.course_assistant to authenticated;

create policy "담당 교수와 본인은 조교 지정을 읽는다"
  on public.course_assistant for select to authenticated
  using (user_id = (select auth.uid()) or public.is_course_professor(course_id));

create policy "담당 교수만 조교를 지정한다"
  on public.course_assistant for insert to authenticated
  with check (public.is_course_professor(course_id));

create policy "담당 교수만 조교를 해제한다"
  on public.course_assistant for delete to authenticated
  using (public.is_course_professor(course_id));

-- 내가 이 과목에서 무엇인지: professor / assistant / student / null(관계없음)
create function public.my_course_role(target_course uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_course_professor(target_course) then 'professor'
    when exists (
      select 1 from public.course_assistant
      where course_id = target_course and user_id = (select auth.uid())
    ) then 'assistant'
    when exists (
      select 1 from public.enrollment
      where course_id = target_course and student_id = (select auth.uid())
    ) then 'student'
  end;
$$;

revoke execute on function public.my_course_role(uuid) from public, anon;
grant execute on function public.my_course_role(uuid) to authenticated;

-- 수강생 명단: 담당 교수만. 학교 메일은 auth.users에 있어서 함수로 돌려준다.
-- 전화번호는 넣지 않는다.
create function public.course_roster(target_course uuid)
returns table (
  student_id uuid,
  name text,
  student_number text,
  email text,
  joined_at timestamptz,
  is_assistant boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_course_professor(target_course) then
    raise exception '담당 교수만 수강생 명단을 볼 수 있습니다' using errcode = '42501';
  end if;

  return query
    select
      e.student_id,
      p.name,
      p.student_number,
      u.email::text,
      e.created_at,
      exists (
        select 1 from public.course_assistant a
        where a.course_id = e.course_id and a.user_id = e.student_id
      )
    from public.enrollment e
    join public.profile p on p.id = e.student_id
    join auth.users u on u.id = e.student_id
    where e.course_id = target_course
    order by p.student_number nulls last, p.name;
end;
$$;

revoke execute on function public.course_roster(uuid) from public, anon;
grant execute on function public.course_roster(uuid) to authenticated;

-- 초대 코드 발급: 겹치면 다시 뽑는다. 과목을 열 때와 재발급할 때 함께 쓴다.
create function public.issue_invite_code(target_course uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  for attempt in 1..5 loop
    candidate := public.new_invite_code();
    begin
      insert into public.course_invite (course_id, invite_code)
      values (target_course, candidate)
      on conflict (course_id) do update set invite_code = excluded.invite_code;
      return candidate;
    exception when unique_violation then
      -- 다른 과목이 쓰는 코드였다. 다시 뽑는다.
    end;
  end loop;
  raise exception '초대 코드를 만들지 못했습니다. 다시 시도해 주세요';
end;
$$;

create or replace function public.handle_new_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.issue_invite_code(new.id);
  return new;
end;
$$;

-- 담당 교수가 초대 코드를 새로 발급한다. 이전 코드로는 더 이상 참여할 수 없다.
create function public.regenerate_invite_code(target_course uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_course_professor(target_course) then
    raise exception '담당 교수만 초대 코드를 재발급할 수 있습니다' using errcode = '42501';
  end if;
  return public.issue_invite_code(target_course);
end;
$$;

revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
revoke execute on function public.issue_invite_code(uuid) from public, anon, authenticated;
