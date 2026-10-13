-- 과제 공개 여부
--
-- 과제마다 공개/비공개를 정한다. 비공개 과제는 그 과목의 담당 교수와 조교만 보고,
-- 그 밖의 사용자에게는 목록, 과제 화면, 검색, 첨부파일, 제출이 모두 막힌다.
-- 미리 써 두었다가 원하는 때에 내보내는 용도다. (공개 범위 visibility와는 다르다:
-- 공개 범위는 마감 후 제출물을 누가 보는지를 정한다.)
alter table public.assignment
  add column published boolean not null default true;

grant insert (published) on public.assignment to authenticated;
grant update (published) on public.assignment to authenticated;

drop policy "로그인한 사용자는 과제를 읽는다" on public.assignment;

create policy "공개 과제는 로그인한 누구나, 비공개 과제는 담당 교수와 조교만 읽는다"
  on public.assignment for select to authenticated
  using (published or public.is_professor_or_assistant(course_id));

-- 비공개 과제에는 제출할 수 없다.
create or replace function public.can_submit(target_assignment uuid)
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
      and now() < due_at
  );
$$;

-- 첨부파일 읽기: 그 과목 사람이고, 과제가 공개됐거나 내가 담당 교수·조교일 때
create function public.can_read_assignment_file(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(object_name, '/', 1);
  target public.assignment;
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into target from public.assignment where id = folder::uuid;
  if not found then
    return false;
  end if;
  return public.is_course_member(target.course_id)
    and (target.published or public.is_professor_or_assistant(target.course_id));
end;
$$;

revoke execute on function public.can_read_assignment_file(text) from public, anon;
grant execute on function public.can_read_assignment_file(text) to authenticated;

drop policy "그 과목 사람은 과제 첨부파일을 읽는다" on storage.objects;

create policy "그 과목 사람은 볼 수 있는 과제의 첨부파일을 읽는다"
  on storage.objects for select to authenticated
  using (bucket_id = 'assignment-files' and public.can_read_assignment_file(name));
