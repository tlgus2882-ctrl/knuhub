-- 학번 로그인 (#5)
-- 학번으로 학교 메일을 찾는다. 다른 사람의 메일이 드러나므로 서버의
-- 관리자 키(service_role)로만 부를 수 있다. 브라우저(anon, authenticated)는 못 부른다.
-- 학번은 메일 인증 후에만 profile에 붙으므로, 인증을 마친 사용자만 찾는다.
create function public.login_email_for_student_number(candidate text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profile p
  join auth.users u on u.id = p.id
  where p.student_number = candidate;
$$;

revoke execute on function public.login_email_for_student_number(text) from public, anon, authenticated;
grant execute on function public.login_email_for_student_number(text) to service_role;
