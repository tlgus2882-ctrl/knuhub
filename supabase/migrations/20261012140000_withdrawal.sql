-- 탈퇴 (#19)
--
-- 사용자(auth.users)를 지우면 프로필, 연락처, 수강·조교 관계, 제출물, 제출 파일 목록,
-- 리뷰가 외래 키로 함께 지워진다. Storage 파일만은 SQL로 지울 수 없으므로
-- 서버가 이 함수가 준 목록을 받아 두었다가 사용자를 지운 뒤 Storage에서 지운다.
--
-- 오류 코드: KH006 과목을 연 교수 (지우면 과목과 학생들의 제출물까지 지워지므로
--           스스로 탈퇴할 수 없고 관리자가 처리한다, docs/adr/0003)
create function public.prepare_withdrawal()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if exists (select 1 from public.course where professor_id = me) then
    raise exception '과목을 연 교수는 스스로 탈퇴할 수 없어요. 관리자에게 문의해 주세요.'
      using errcode = 'KH006';
  end if;

  -- 내 제출 폴더({assignment_id}/{내 id}/...)의 모든 객체: 제출하지 않은 업로드도 포함
  return coalesce(
    (
      select array_agg(name order by name)
      from storage.objects
      where bucket_id = 'submissions' and (storage.foldername(name))[2] = me::text
    ),
    '{}'
  );
end;
$$;

revoke execute on function public.prepare_withdrawal() from public, anon;
grant execute on function public.prepare_withdrawal() to authenticated;
