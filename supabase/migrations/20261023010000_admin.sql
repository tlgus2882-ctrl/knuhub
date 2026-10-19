-- 관리자 페이지 (v2, #51)
--
-- 대시보드에서 손으로 하던 일을 화면으로 옮긴다: 사용자 찾기, 교수 승격, 학번 정정, 보관된 과목 보기.
-- 권한은 관리자 전용 DB 함수와 RLS로만 확인한다 (docs/adr/0002). 학교 메일은 auth.users에 있어서
-- 사용자 목록은 security definer 함수가 관리자에게만 돌려준다.
--
-- 오류 코드: KH011 관리자가 아님, KH012 학번이 형식에 맞지 않거나 다른 사용자가 쓰고 있음,
--           KH013 학생이 아니라서 교수로 승격할 수 없음

create function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = 'KH011';
  end if;
end;
$$;

revoke execute on function public.assert_admin() from public, anon;
grant execute on function public.assert_admin() to authenticated;

-- 사용자 목록: 이름, 학번, 학교 메일 중 하나에 query가 들어간 사용자 (최근 가입 순, 200명까지)
create function public.admin_list_users(query text)
returns table (id uuid, name text, student_number text, email text, role public.role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text := '%' || replace(replace(replace(coalesce(btrim(query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.assert_admin();
  return query
  select p.id, p.name, p.student_number, u.email::text, p.role, p.created_at
  from public.profile p
  join auth.users u on u.id = p.id
  where p.name ilike pattern or p.student_number ilike pattern or u.email ilike pattern
  order by p.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.admin_list_users(text) from public, anon;
grant execute on function public.admin_list_users(text) to authenticated;

-- 학생을 교수로 승격한다. 교수·관리자는 그대로 둔다 (관리자 지정은 계속 대시보드에서만).
create function public.admin_promote_to_professor(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.profile set role = 'professor' where id = target_user and role = 'student';
  if not found then
    raise exception '학생만 교수로 승격할 수 있어요' using errcode = 'KH013';
  end if;
end;
$$;

revoke execute on function public.admin_promote_to_professor(uuid) from public, anon;
grant execute on function public.admin_promote_to_professor(uuid) to authenticated;

-- 학번을 정정한다. 빈 값이면 비운다 (다른 사람이 차지한 학번을 되찾아 줄 때 먼저 비운다).
-- 메일 인증 전까지 맡아 둔 학번도 함께 지워서 나중에 덮어쓰지 않게 한다.
create function public.admin_set_student_number(target_user uuid, new_student_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := nullif(btrim(new_student_number), '');
begin
  perform public.assert_admin();
  if wanted is not null and (
    wanted !~ '^[0-9]{6,12}$'
    or exists (select 1 from public.profile where student_number = wanted and id <> target_user)
  ) then
    raise exception '형식에 맞지 않거나 다른 사용자가 쓰고 있는 학번이에요' using errcode = 'KH012';
  end if;

  update public.profile set student_number = wanted where id = target_user;
  update public.profile_private set pending_student_number = null where id = target_user;
end;
$$;

revoke execute on function public.admin_set_student_number(uuid, text) from public, anon;
grant execute on function public.admin_set_student_number(uuid, text) to authenticated;

-- 보관된 과목 ----------------------------------------------------------------
-- 교수가 탈퇴해 보관된 과목과 그 과제·제출물·리뷰는 관리자만 읽는다 (docs/adr/0003). 쓰기는 여전히 트리거만 한다.

grant select on public.archived_course, public.archived_assignment, public.archived_assignment_file, public.archived_grading_criterion, public.archived_submission, public.archived_submission_file, public.archived_submission_history, public.archived_submission_history_file, public.archived_review, public.archived_first_check to authenticated;

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_course for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_assignment for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_assignment_file for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_grading_criterion for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_submission for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_submission_file for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_submission_history for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_submission_history_file for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_review for select to authenticated
  using (public.is_admin());

create policy "관리자는 보관 기록을 읽는다"
  on public.archived_first_check for select to authenticated
  using (public.is_admin());
