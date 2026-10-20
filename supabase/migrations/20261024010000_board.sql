-- 메인 게시판과 신고 (v2, #52)
--
-- 로그인한 누구나 말머리를 골라 글을 쓰고 댓글을 단다. 익명은 없다 (작성자는 항상 나 자신).
-- 글쓴이는 자기 글·댓글을 고치고 지우고, 관리자는 메인 게시판의 글·댓글을 지운다.
-- 신고는 관리자만 읽고 닫는다. 탈퇴하면 글·댓글·신고가 외래 키로 함께 지워진다.
-- 과목 게시판(#53)은 같은 글·댓글 구조에 "어느 과목인가"를 더한다.

create type public.post_category as enum ('free', 'question', 'career', 'info', 'etc');

create table public.post (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  category public.post_category not null,
  title text not null check (title ~ '[^[:space:]]' and length(title) <= 200),
  body text not null check (body ~ '[^[:space:]]' and length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_created_at_idx on public.post (created_at desc);
create index post_category_created_at_idx on public.post (category, created_at desc);
create index post_author_id_idx on public.post (author_id);

create table public.post_comment (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.post (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  body text not null check (body ~ '[^[:space:]]' and length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_comment_post_id_idx on public.post_comment (post_id, created_at);
create index post_comment_author_id_idx on public.post_comment (author_id);

alter table public.post enable row level security;
alter table public.post_comment enable row level security;

-- 작성자는 항상 나 자신(author_id 기본값). 고칠 수 있는 건 말머리·제목·본문뿐이다.
revoke all on public.post, public.post_comment from anon, authenticated;
grant select, delete on public.post, public.post_comment to authenticated;
grant insert (category, title, body), update (category, title, body) on public.post to authenticated;
grant insert (post_id, body), update (body) on public.post_comment to authenticated;

create policy "로그인한 사용자는 메인 게시판 글을 읽는다"
  on public.post for select to authenticated using (true);

create policy "내 이름으로 글을 쓴다"
  on public.post for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "글쓴이는 자기 글을 고친다"
  on public.post for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "글쓴이와 관리자는 글을 지운다"
  on public.post for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create policy "로그인한 사용자는 댓글을 읽는다"
  on public.post_comment for select to authenticated using (true);

create policy "내 이름으로 댓글을 단다"
  on public.post_comment for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "글쓴이는 자기 댓글을 고친다"
  on public.post_comment for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "글쓴이와 관리자는 댓글을 지운다"
  on public.post_comment for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create trigger post_touch_updated_at
  before update on public.post
  for each row execute function public.touch_updated_at();

create trigger post_comment_touch_updated_at
  before update on public.post_comment
  for each row execute function public.touch_updated_at();

-- 신고: 글이나 댓글 중 하나를 사유와 함께 신고한다. 같은 대상은 한 사람이 한 번만.
-- 관리자가 대상을 지우면 신고도 함께 지워지고, 지우지 않을 때는 신고를 닫는다(closed_at).
create table public.report (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  post_id uuid references public.post (id) on delete cascade,
  comment_id uuid references public.post_comment (id) on delete cascade,
  reason text not null check (reason ~ '[^[:space:]]' and length(reason) <= 1000),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (num_nonnulls(post_id, comment_id) = 1),
  unique (reporter_id, post_id),
  unique (reporter_id, comment_id)
);

create index report_open_idx on public.report (created_at) where closed_at is null;
create index report_post_id_idx on public.report (post_id);
create index report_comment_id_idx on public.report (comment_id);

alter table public.report enable row level security;

revoke all on public.report from anon, authenticated;
grant select on public.report to authenticated;
grant insert (post_id, comment_id, reason) on public.report to authenticated;
grant update (closed_at) on public.report to authenticated;

-- 메인 게시판은 로그인한 누구나 읽으므로 누구나 신고한다. 신고한 사람도 신고 목록은 못 본다.
create policy "내 이름으로 신고한다"
  on public.report for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "관리자만 신고를 읽는다"
  on public.report for select to authenticated using (public.is_admin());

create policy "관리자만 신고를 닫는다"
  on public.report for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
