-- 과목 게시판 (v2, #53)
--
-- 메인 게시판과 같은 글·댓글 구조에 "어느 과목인가"(course_id, 비어 있으면 메인 게시판)를 더한다.
-- 과목 게시판은 그 과목 사람(수강생, 조교, 담당 교수)만 읽고 쓰고, 교수·조교만 공지를 올린다.
-- 담당 교수·조교는 그 과목 글·댓글을, 관리자는 신고를 처리할 수 있게 모든 글·댓글을 읽고 지운다.
-- 교수가 탈퇴하면 과목이 지워지면서 과목 게시판 글도 보관 없이 함께 지워진다 (외래 키).

alter table public.post
  add column course_id uuid references public.course (id) on delete cascade,
  add column is_notice boolean not null default false,
  alter column category drop not null,
  -- 메인 게시판 글에만 말머리가 있고 반드시 있다. 공지는 과목 게시판에만 있다.
  add constraint post_category_only_on_main check ((course_id is null) = (category is not null)),
  add constraint post_notice_only_in_course check (not is_notice or course_id is not null);

create index post_course_id_created_at_idx on public.post (course_id, created_at desc) where course_id is not null;

grant insert (course_id, is_notice), update (is_notice) on public.post to authenticated;

-- 이 게시판(과목 또는 메인)을 읽고 쓸 수 있는가
create function public.can_use_board(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_course is null or public.is_course_member(target_course) or public.is_admin();
$$;

-- 이 게시판의 남의 글·댓글을 지울 수 있는가: 과목은 담당 교수·조교, 그리고 관리자
create function public.can_moderate_board(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or (target_course is not null and public.is_professor_or_assistant(target_course));
$$;

-- 댓글·신고는 글의 게시판 규칙을 따른다. RLS를 거치지 않고 글의 과목을 찾는다.
create function public.post_course(target_post uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select course_id from public.post where id = target_post;
$$;

create function public.can_use_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.post where id = target_post and public.can_use_board(course_id));
$$;

revoke execute on function public.can_use_board(uuid), public.can_moderate_board(uuid), public.post_course(uuid),
  public.can_use_post(uuid) from public, anon;
grant execute on function public.can_use_board(uuid), public.can_moderate_board(uuid), public.post_course(uuid),
  public.can_use_post(uuid) to authenticated;

drop policy "로그인한 사용자는 메인 게시판 글을 읽는다" on public.post;
drop policy "내 이름으로 글을 쓴다" on public.post;
drop policy "글쓴이는 자기 글을 고친다" on public.post;
drop policy "글쓴이와 관리자는 글을 지운다" on public.post;
drop policy "로그인한 사용자는 댓글을 읽는다" on public.post_comment;
drop policy "내 이름으로 댓글을 단다" on public.post_comment;
drop policy "글쓴이와 관리자는 댓글을 지운다" on public.post_comment;
drop policy "내 이름으로 신고한다" on public.report;

create policy "게시판을 쓸 수 있으면 글을 읽는다"
  on public.post for select to authenticated
  using (public.can_use_board(course_id));

create policy "내 이름으로 글을 쓰고, 공지는 교수·조교만 올린다"
  on public.post for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_use_board(course_id)
    and (not is_notice or public.is_professor_or_assistant(course_id))
  );

create policy "글쓴이는 자기 글을 고치고, 공지로는 교수·조교만 바꾼다"
  on public.post for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and (not is_notice or public.is_professor_or_assistant(course_id)));

create policy "글쓴이와 게시판 관리 권한이 있는 사람은 글을 지운다"
  on public.post for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_moderate_board(course_id));

create policy "글을 읽을 수 있으면 댓글도 읽는다"
  on public.post_comment for select to authenticated
  using (public.can_use_post(post_id));

create policy "읽을 수 있는 글에 내 이름으로 댓글을 단다"
  on public.post_comment for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_use_post(post_id));

create policy "글쓴이와 게시판 관리 권한이 있는 사람은 댓글을 지운다"
  on public.post_comment for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_moderate_board(public.post_course(post_id)));

create policy "읽을 수 있는 글·댓글을 내 이름으로 신고한다"
  on public.report for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (post_id is null or public.can_use_post(post_id))
    and (comment_id is null or exists (
      select 1 from public.post_comment c where c.id = comment_id and public.can_use_post(c.post_id)
    ))
  );
