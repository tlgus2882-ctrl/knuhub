-- 팀 추첨 (#92)
--
-- 담당 교수만 과목 게시판에 올리는 특별한 글(공지처럼 위에 보인다). 추첨 대상을 팀당 인원의 팀으로 나눈다.
-- 무작위 방식은 교수가 바로 나누고, 설문 방식은 마감까지 설문 응답을 받아 서버가 AI로 나눈다.
-- 서버가 혼자 돌지 않으므로, 마감이 지난 뒤 누군가 글을 처음 열 때 claim_team_draw()로 한 사람만 추첨을 맡는다.
-- 결과(팀 구성원)는 공개 전에는 교수·조교만, 공개 뒤에는 그 과목 사람이 본다. 공개 뒤에는 다시 추첨할 수 없고
-- 교수가 사람을 옮기고 빼고 더하는 것만 할 수 있다. 설문 응답은 본인과 담당 교수만, AI 편성 근거는 담당 교수만 본다.
-- 교수가 탈퇴하면 과목이 지워지며 글과 함께 지워지고, 수강생이 과목에서 빠지면 팀에서도 빠진다 (외래 키).
--
-- 오류 코드: KH017 지금 상태에서는 할 수 없음 (공개 뒤 다시 추첨·설정 변경 등), KH018 응답이 있어 문항을 바꿀 수 없음,
--           KH019 설문 응답이 문항과 맞지 않음

create type public.team_draw_mode as enum ('random', 'survey');
-- open: 추첨 전(설문 방식이면 응답을 받는 중), drawing: 누군가 추첨하는 중, failed: AI 추첨 실패,
-- drafted: 교수 확인 중(공개 전), published: 공개
create type public.team_draw_status as enum ('open', 'drawing', 'failed', 'drafted', 'published');

-- 설문 문항: [{ "title": 글, "kind": "choice" | "text", "options": [글, ...] (객관식만, 2개 이상) }, ...]
create function public.valid_survey_questions(questions jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
begin
  if jsonb_typeof(questions) <> 'array' or jsonb_array_length(questions) > 20 then return false; end if;
  for q in select * from jsonb_array_elements(questions) loop
    if jsonb_typeof(q->'title') is distinct from 'string' or btrim(q->>'title') = '' or char_length(q->>'title') > 200 then
      return false;
    end if;
    if q->>'kind' = 'choice' then
      if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 10
        or exists (select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
        return false;
      end if;
    elsif q->>'kind' is distinct from 'text' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.team_draw (
  post_id uuid primary key references public.post (id) on delete cascade,
  course_id uuid not null references public.course (id) on delete cascade,
  mode public.team_draw_mode not null,
  team_size integer not null check (team_size between 2 and 50),
  -- 편성 기준 (설문 방식)
  criteria text not null default '' check (char_length(criteria) <= 2000),
  questions jsonb not null default '[]' check (public.valid_survey_questions(questions)),
  survey_due_at timestamptz,
  -- 추첨 대상에서 뺀 수강생
  excluded uuid[] not null default '{}',
  status public.team_draw_status not null default 'open',
  drawing_started_at timestamptz,
  published_at timestamptz,
  -- 공개 뒤 마지막으로 팀 구성원을 고친 시각
  edited_at timestamptz,
  constraint team_draw_survey_has_due check ((mode = 'survey') = (survey_due_at is not null)),
  constraint team_draw_survey_has_questions check (mode = 'random' or jsonb_array_length(questions) > 0)
);

create index team_draw_course_id_idx on public.team_draw (course_id);

-- AI 편성 근거: 담당 교수만 본다
create table public.team_draw_note (
  post_id uuid primary key references public.team_draw (post_id) on delete cascade,
  rationale text not null
);

-- 팀 구성원. 이름만 더한 사람(guest_name)은 추첨 전에도 있고(team_no 없음), 사용자는 추첨 결과로만 생긴다.
create table public.team_member (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_draw (post_id) on delete cascade,
  course_id uuid not null,
  team_no integer check (team_no >= 1),
  user_id uuid references public.profile (id) on delete cascade,
  guest_name text check (char_length(btrim(guest_name)) between 1 and 50),
  constraint team_member_user_or_guest check ((user_id is null) <> (guest_name is null)),
  constraint team_member_user_has_team check (user_id is null or team_no is not null),
  unique (post_id, user_id),
  -- 수강생에서 빠지면(내보내기, 탈퇴) 팀에서도 빠진다
  foreign key (course_id, user_id) references public.enrollment (course_id, student_id) on delete cascade
);

create index team_member_post_id_idx on public.team_member (post_id);
create index team_member_course_user_idx on public.team_member (course_id, user_id);
create index team_member_user_id_idx on public.team_member (user_id);

create table public.survey_response (
  post_id uuid not null references public.team_draw (post_id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profile (id) on delete cascade,
  answers jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index survey_response_user_id_idx on public.survey_response (user_id);

alter table public.team_draw enable row level security;
alter table public.team_draw_note enable row level security;
alter table public.team_member enable row level security;
alter table public.survey_response enable row level security;

revoke all on public.team_draw, public.team_draw_note, public.team_member, public.survey_response from anon, authenticated;
grant select, update (team_size, criteria, questions, survey_due_at, excluded) on public.team_draw to authenticated;
grant select on public.team_draw_note to authenticated;
grant select, insert (post_id, course_id, team_no, user_id, guest_name), update (team_no), delete on public.team_member to authenticated;
grant select, insert (post_id, answers), update (post_id, answers) on public.survey_response to authenticated;

-- 이 글이 팀 추첨인가 (좋아요·신고를 막는 데 쓴다). RLS를 거치지 않는다.
create function public.is_team_draw(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_draw where post_id = target_post);
$$;

-- 지금 이 설문에 응답할 수 있는가: 그 과목 수강생(조교는 추첨 대상이 아니라 빠진다)이고, 설문 방식이며, 추첨 전이고 마감 전이다.
create function public.can_answer_survey(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_draw
    where post_id = target_post and mode = 'survey' and status = 'open' and now() < survey_due_at
      and public.is_enrolled(course_id) and not public.is_professor_or_assistant(course_id)
  );
$$;

create function public.team_draw_course(target_post uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select course_id from public.team_draw where post_id = target_post;
$$;

revoke execute on function public.is_team_draw(uuid), public.can_answer_survey(uuid), public.team_draw_course(uuid) from public, anon;
grant execute on function public.is_team_draw(uuid), public.can_answer_survey(uuid), public.team_draw_course(uuid) to authenticated;

create policy "그 과목 사람은 팀 추첨을 읽는다"
  on public.team_draw for select to authenticated
  using (public.can_use_board(course_id));

create policy "담당 교수는 팀 추첨 설정을 고친다"
  on public.team_draw for update to authenticated
  using (public.is_course_professor(course_id))
  with check (public.is_course_professor(course_id));

create policy "담당 교수는 AI 편성 근거를 읽는다"
  on public.team_draw_note for select to authenticated
  using (public.is_course_professor(public.team_draw_course(post_id)));

create policy "교수·조교는 늘, 그 과목 사람은 공개 뒤 팀을 읽는다"
  on public.team_member for select to authenticated
  using (
    public.is_professor_or_assistant(course_id)
    or (public.is_course_member(course_id) and exists (
      select 1 from public.team_draw d where d.post_id = team_member.post_id and d.status = 'published'
    ))
  );

create policy "담당 교수는 팀에 사람을 더한다"
  on public.team_member for insert to authenticated
  with check (public.is_course_professor(public.team_draw_course(post_id)));

create policy "담당 교수는 팀원을 옮긴다"
  on public.team_member for update to authenticated
  using (public.is_course_professor(course_id))
  with check (public.is_course_professor(course_id));

create policy "담당 교수는 팀에서 사람을 뺀다"
  on public.team_member for delete to authenticated
  using (public.is_course_professor(course_id));

create policy "본인과 담당 교수는 설문 응답을 읽는다"
  on public.survey_response for select to authenticated
  using (user_id = (select auth.uid()) or public.is_course_professor(public.team_draw_course(post_id)));

create policy "마감 전에 내 설문 응답을 낸다"
  on public.survey_response for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_answer_survey(post_id));

create policy "마감 전에 내 설문 응답을 고친다"
  on public.survey_response for update to authenticated
  using (user_id = (select auth.uid()) and public.can_answer_survey(post_id))
  with check (user_id = (select auth.uid()) and public.can_answer_survey(post_id));

-- 설정은 공개 전(추첨 중 아님)에만 바꾼다. 응답이 하나라도 있으면 문항은 잠긴다.
create function public.guard_team_draw_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.team_size, new.criteria, new.questions, new.survey_due_at) is distinct from
     (old.team_size, old.criteria, old.questions, old.survey_due_at)
     and old.status in ('drawing', 'published')
     and (select auth.jwt()->>'role') = 'authenticated' then
    raise exception '추첨 중이거나 공개한 팀 추첨의 설정은 바꿀 수 없어요' using errcode = 'KH017';
  end if;
  if new.questions is distinct from old.questions
     and exists (select 1 from public.survey_response where post_id = old.post_id) then
    raise exception '응답이 들어와서 문항을 바꿀 수 없어요' using errcode = 'KH018';
  end if;
  return new;
end;
$$;

create trigger team_draw_guard_settings
  before update on public.team_draw
  for each row execute function public.guard_team_draw_settings();

-- 응답은 문항 수만큼 비지 않은 글이고, 객관식은 보기 중 하나다.
create function public.check_survey_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  questions jsonb;
  answer text;
begin
  select d.questions into questions from public.team_draw d where d.post_id = new.post_id;
  if jsonb_typeof(new.answers) <> 'array' or jsonb_array_length(new.answers) <> jsonb_array_length(questions) then
    raise exception '모든 문항에 답해 주세요' using errcode = 'KH019';
  end if;
  for i in 0 .. jsonb_array_length(questions) - 1 loop
    answer := new.answers->>i;
    if jsonb_typeof(new.answers->i) <> 'string' or btrim(answer) = '' or char_length(answer) > 2000
       or (questions->i->>'kind' = 'choice' and not (questions->i->'options') ? answer) then
      raise exception '모든 문항에 답해 주세요' using errcode = 'KH019';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

create trigger survey_response_check
  before insert or update on public.survey_response
  for each row execute function public.check_survey_response();

-- 팀 구성원의 과목은 보낸 값과 상관없이 팀 추첨의 과목이다.
create function public.set_team_member_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.course_id := (select course_id from public.team_draw where post_id = new.post_id);
  return new;
end;
$$;

create trigger team_member_set_course
  before insert on public.team_member
  for each row execute function public.set_team_member_course();

-- 공개 뒤 팀 구성원이 바뀌면 마지막 수정 시각을 남긴다.
create function public.touch_team_draw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_draw set edited_at = now() where post_id = coalesce(new.post_id, old.post_id) and status = 'published';
  return coalesce(new, old);
end;
$$;

create trigger team_member_touch_draw
  after insert or update or delete on public.team_member
  for each row execute function public.touch_team_draw();

-- 추첨 대상 (서버만): 지금의 수강생에서 조교와 담당 교수가 뺀 사람을 빼고, 이름만 더한 사람을 더한다.
-- key는 finish_team_draw()가 받는 형식이고, answers는 그 사람의 설문 응답(없으면 null)이다.
create function public.team_draw_people(target_post uuid)
returns table (key text, answers jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select 'u:' || e.student_id, r.answers
  from public.team_draw d
  join public.enrollment e on e.course_id = d.course_id
  left join public.survey_response r on r.post_id = d.post_id and r.user_id = e.student_id
  where d.post_id = target_post
    and e.student_id <> all (d.excluded)
    and not exists (select 1 from public.course_assistant a where a.course_id = d.course_id and a.user_id = e.student_id)
  union all
  select 'g:' || m.id, null
  from public.team_member m
  where m.post_id = target_post and m.user_id is null;
$$;

revoke execute on function public.team_draw_people(uuid) from public, anon, authenticated;
grant execute on function public.team_draw_people(uuid) to service_role;

-- 팀 추첨을 올린다: 담당 교수만. 글은 공지처럼 목록 위에 보인다. 반환값: 글 id.
create function public.create_team_draw(
  target_course uuid,
  title text,
  body text,
  mode public.team_draw_mode,
  team_size integer,
  criteria text default '',
  questions jsonb default '[]',
  survey_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_post uuid;
begin
  if not public.is_course_professor(target_course) then
    raise exception '담당 교수만 팀 추첨을 올릴 수 있어요' using errcode = '42501';
  end if;
  insert into public.post (author_id, course_id, is_notice, title, body)
  values ((select auth.uid()), target_course, true, title, body)
  returning id into new_post;
  insert into public.team_draw (post_id, course_id, mode, team_size, criteria, questions, survey_due_at)
  values (new_post, target_course, mode, team_size, coalesce(criteria, ''), coalesce(questions, '[]'),
          case when mode = 'survey' then survey_due_at end);
  return new_post;
end;
$$;

-- 추첨을 맡는다. 맡았으면 맡은 시각을 돌려주고(못 맡았으면 null), 서버가 나눈 다음 그 시각으로 finish_team_draw()를 부른다.
-- 담당 교수는 공개 전이면 언제든(설문 방식이면 그 자리에서 마감), 그 과목 사람은 설문 마감이 지난 뒤에만 맡는다.
-- 5분 넘게 끝나지 않은 추첨은 다시 맡을 수 있다.
create function public.claim_team_draw(target_post uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.team_draw;
  professor boolean;
begin
  select * into d from public.team_draw where post_id = target_post for update;
  if not found or not public.is_course_member(d.course_id) then return null; end if;
  if d.status = 'published' then
    raise exception '공개한 팀 추첨은 다시 추첨할 수 없어요' using errcode = 'KH017';
  end if;
  if d.status = 'drawing' and d.drawing_started_at > now() - interval '5 minutes' then return null; end if;

  professor := public.is_course_professor(d.course_id);
  if not professor and not (d.mode = 'survey' and d.status in ('open', 'drawing') and d.survey_due_at <= now()) then
    return null;
  end if;

  update public.team_draw
  set status = 'drawing', drawing_started_at = now(), survey_due_at = case when mode = 'survey' then least(survey_due_at, now()) end
  where post_id = target_post;
  return now();
end;
$$;

-- 추첨을 끝낸다 (서버만). teams: 팀마다 구성원 key 배열 ("u:<사용자 id>" 또는 "g:<이름만 더한 사람의 team_member id>").
-- 이전 결과는 지우고 새로 쓰며, teams가 null이면 결과 없이 실패로 남긴다.
-- claimed_at은 claim_team_draw()가 돌려준 시각이다. 그 사이 다른 사람이 다시 맡았거나 공개했으면 아무것도 하지 않고 false.
create function public.finish_team_draw(target_post uuid, claimed_at timestamptz, teams jsonb, rationale text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  team jsonb;
  team_index bigint;
  member_key text;
begin
  perform 1 from public.team_draw
  where post_id = target_post and status = 'drawing' and drawing_started_at = claimed_at
  for update;
  if not found then return false; end if;

  delete from public.team_member where post_id = target_post and user_id is not null;
  update public.team_member set team_no = null where post_id = target_post;
  delete from public.team_draw_note where post_id = target_post;
  if teams is null then
    update public.team_draw set status = 'failed', drawing_started_at = null where post_id = target_post;
    return true;
  end if;

  for team, team_index in select * from jsonb_array_elements(teams) with ordinality loop
    for member_key in select * from jsonb_array_elements_text(team) loop
      if starts_with(member_key, 'u:') then
        insert into public.team_member (post_id, team_no, user_id) values (target_post, team_index, substr(member_key, 3)::uuid);
      else
        update public.team_member set team_no = team_index where id = substr(member_key, 3)::uuid and post_id = target_post;
      end if;
    end loop;
  end loop;

  if rationale is not null then
    insert into public.team_draw_note (post_id, rationale) values (target_post, rationale);
  end if;
  update public.team_draw set status = 'drafted', drawing_started_at = null where post_id = target_post;
  return true;
end;
$$;

-- 결과를 공개한다: 담당 교수만, 확인 중(drafted)일 때만.
create function public.publish_team_draw(target_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_draw set status = 'published', published_at = now()
  where post_id = target_post and status = 'drafted' and public.is_course_professor(course_id);
  if not found then
    raise exception '확인 중인 팀 추첨만 담당 교수가 공개할 수 있어요' using errcode = 'KH017';
  end if;
end;
$$;

revoke execute on function public.create_team_draw(uuid, text, text, public.team_draw_mode, integer, text, jsonb, timestamptz),
  public.claim_team_draw(uuid), public.publish_team_draw(uuid), public.finish_team_draw(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.create_team_draw(uuid, text, text, public.team_draw_mode, integer, text, jsonb, timestamptz),
  public.claim_team_draw(uuid), public.publish_team_draw(uuid) to authenticated;
revoke execute on function public.finish_team_draw(uuid, timestamptz, jsonb, text) from authenticated;
grant execute on function public.finish_team_draw(uuid, timestamptz, jsonb, text) to service_role;

-- 팀 추첨 글에는 좋아요와 신고가 없다 (댓글은 있다).
drop policy "읽을 수 있는 글에 내 이름으로 좋아요를 누른다" on public.post_like;
create policy "읽을 수 있는 글에 내 이름으로 좋아요를 누른다"
  on public.post_like for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_use_post(post_id) and not public.is_team_draw(post_id));

drop policy "읽을 수 있는 글·댓글을 내 이름으로 신고한다" on public.report;
create policy "읽을 수 있는 글·댓글을 내 이름으로 신고한다"
  on public.report for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (post_id is null or (public.can_use_post(post_id) and not public.is_team_draw(post_id)))
    and (comment_id is null or exists (
      select 1 from public.post_comment c where c.id = comment_id and public.can_use_post(c.post_id)
    ))
  );
