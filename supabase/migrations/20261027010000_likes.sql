-- 좋아요 (v2, #58)
--
-- 사용자와 대상(제출물 또는 게시판 글)마다 하나다. 대상을 볼 수 있는 사람만 누르고 개수를 본다.
-- 탈퇴하면 그 사람의 좋아요가 외래 키로 함께 지워진다.

create table public.submission_like (
  submission_id uuid not null references public.submission (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create table public.post_like (
  post_id uuid not null references public.post (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index submission_like_user_id_idx on public.submission_like (user_id);
create index post_like_user_id_idx on public.post_like (user_id);

alter table public.submission_like enable row level security;
alter table public.post_like enable row level security;

-- 누를 때는 대상만 고른다 (누른 사람은 항상 나 자신). 고치기는 없고 취소는 지우기다.
revoke all on public.submission_like, public.post_like from anon, authenticated;
grant select, delete on public.submission_like, public.post_like to authenticated;
grant insert (submission_id) on public.submission_like to authenticated;
grant insert (post_id) on public.post_like to authenticated;

create policy "볼 수 있는 제출물의 좋아요를 읽는다"
  on public.submission_like for select to authenticated
  using (public.can_view_submission(submission_id));

create policy "볼 수 있는 제출물에 내 이름으로 좋아요를 누른다"
  on public.submission_like for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_submission(submission_id));

create policy "내 좋아요를 취소한다"
  on public.submission_like for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "읽을 수 있는 글의 좋아요를 읽는다"
  on public.post_like for select to authenticated
  using (public.can_use_post(post_id));

create policy "읽을 수 있는 글에 내 이름으로 좋아요를 누른다"
  on public.post_like for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_use_post(post_id));

create policy "내 글 좋아요를 취소한다"
  on public.post_like for delete to authenticated
  using (user_id = (select auth.uid()));
