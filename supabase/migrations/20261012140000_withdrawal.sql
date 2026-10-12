-- 탈퇴 (#19)
--
-- 사용자(auth.users)를 지우면 프로필, 연락처, 수강·조교 관계, 제출물, 제출 파일 목록,
-- 리뷰가 외래 키로 함께 지워진다. Storage 파일만은 SQL로 지울 수 없으므로
-- 서버가 prepare_withdrawal()이 준 목록을 받아 두었다가 사용자를 지운 뒤 Storage에서 지운다.
--
-- 교수가 탈퇴하면 그 교수가 연 과목은 지우기 전에 보관 테이블로 옮긴다 (docs/adr/0003).
-- 보관 테이블은 관리자만 대시보드에서 본다. 학생들의 제출 파일은 Storage에 남고
-- 보관 테이블이 그 위치를 기억한다.
--
-- 오류 코드: KH006 파일을 올리는 중 (올렸지만 아직 제출하지 않은 파일이 최근에 있다)

-- 보관 테이블 ----------------------------------------------------------------
-- 원래 id를 그대로 쓰고, 사용자는 지워져도 남도록 이름·학번을 함께 적어 둔다.

create table public.archived_course (
  id uuid primary key,
  name text not null,
  semester text not null,
  section text not null,
  professor_id uuid not null,
  professor_name text not null,
  archived_at timestamptz not null default now()
);

create table public.archived_assignment (
  id uuid primary key,
  course_id uuid not null references public.archived_course (id) on delete cascade,
  title text not null,
  description text not null,
  due_at timestamptz not null,
  visibility text not null,
  created_at timestamptz not null
);

create table public.archived_submission (
  id uuid primary key,
  assignment_id uuid not null references public.archived_assignment (id) on delete cascade,
  student_id uuid not null,
  student_name text not null,
  student_number text,
  submitted_at timestamptz not null
);

create table public.archived_submission_file (
  id uuid primary key,
  submission_id uuid not null references public.archived_submission (id) on delete cascade,
  path text not null,
  size bigint not null,
  storage_path text not null,
  kind text not null
);

create table public.archived_review (
  id uuid primary key,
  submission_id uuid not null references public.archived_submission (id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null
);

create index archived_submission_student_id_idx on public.archived_submission (student_id);
create index archived_review_author_id_idx on public.archived_review (author_id);

-- 사용자에게는 아무 권한도 없다 (정책 없음 = 읽기·쓰기 모두 막힘). 관리자는 대시보드에서 본다.
alter table public.archived_course enable row level security;
alter table public.archived_assignment enable row level security;
alter table public.archived_submission enable row level security;
alter table public.archived_submission_file enable row level security;
alter table public.archived_review enable row level security;
revoke all on public.archived_course, public.archived_assignment, public.archived_submission,
  public.archived_submission_file, public.archived_review from anon, authenticated;

-- 프로필이 지워질 때 (탈퇴든 관리자 삭제든) ------------------------------------
-- 1. 그 사람이 담당 교수인 과목을 보관한다. 그 사람이 쓴 리뷰는 보관하지 않는다 (탈퇴 시 리뷰 삭제).
-- 2. 이미 보관된 데이터 중 그 사람의 제출물과 리뷰를 지운다.
-- 이 트리거가 끝난 뒤 외래 키가 원래 과목을 지운다. 모두 한 트랜잭션이다.
create function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.archived_course (id, name, semester, section, professor_id, professor_name)
  select c.id, c.name, c.semester, c.section, c.professor_id, old.name
  from public.course c
  where c.professor_id = old.id;

  insert into public.archived_assignment (id, course_id, title, description, due_at, visibility, created_at)
  select a.id, a.course_id, a.title, a.description, a.due_at, a.visibility::text, a.created_at
  from public.assignment a
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_submission (id, assignment_id, student_id, student_name, student_number, submitted_at)
  select s.id, s.assignment_id, s.student_id, p.name, p.student_number, s.submitted_at
  from public.submission s
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  join public.profile p on p.id = s.student_id
  where c.professor_id = old.id;

  insert into public.archived_submission_file (id, submission_id, path, size, storage_path, kind)
  select f.id, f.submission_id, f.path, f.size, f.storage_path, f.kind::text
  from public.submission_file f
  join public.submission s on s.id = f.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  where c.professor_id = old.id;

  insert into public.archived_review (id, submission_id, author_id, author_name, body, created_at)
  select r.id, r.submission_id, r.author_id, p.name, r.body, r.created_at
  from public.review r
  join public.submission s on s.id = r.submission_id
  join public.assignment a on a.id = s.assignment_id
  join public.course c on c.id = a.course_id
  join public.profile p on p.id = r.author_id
  where c.professor_id = old.id and r.author_id <> old.id;

  delete from public.archived_submission where student_id = old.id;
  delete from public.archived_review where author_id = old.id;

  return old;
end;
$$;

revoke execute on function public.handle_profile_deleted() from public, anon, authenticated;

create trigger on_profile_deleted
  before delete on public.profile
  for each row execute function public.handle_profile_deleted();

-- 탈퇴 준비 ----------------------------------------------------------------
-- 내 제출 폴더({assignment_id}/{내 id}/...)의 모든 객체를 돌려준다. 보관된 과목의 내 파일과
-- 제출하지 않은 업로드도 포함한다. 최근에 올렸는데 아직 제출하지 않은 파일이 있으면
-- 업로드가 진행 중일 수 있으므로 거절한다. 탈퇴가 시작된 뒤의 업로드는 수강 관계가
-- 함께 지워지므로 Storage 정책이 막는다.
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
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'submissions'
      and (storage.foldername(o.name))[2] = me::text
      and o.created_at > now() - interval '10 minutes'
      and not exists (select 1 from public.submission_file f where f.storage_path = o.name)
      and not exists (select 1 from public.archived_submission_file f where f.storage_path = o.name)
  ) then
    raise exception '파일을 올리는 중이에요. 제출을 마친 뒤 다시 시도해 주세요.' using errcode = 'KH006';
  end if;

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
