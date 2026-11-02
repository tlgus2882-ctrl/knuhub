-- 익명 채팅 (#94)
--
-- 모든 화면 오른쪽 아래의 작은 창에서 로그인한 사용자 모두가 같은 방 하나를 쓴다. 사이트에서 유일하게 익명인 곳이라
-- 실제 작성자는 남기되 사용자에게는 채팅 별명(그날 처음 보낸 순서대로 익명 1, 2, …, 한국 시간 자정에 새로)만 보인다.
-- 사용자는 표를 직접 읽거나 쓰지 않고 send_chat_message() / recent_chat_messages()만 부른다. 둘 다 작성자를 돌려주지 않는다.
-- 새 메시지와 지운 메시지는 같은 익명 필드만 실어 Realtime 비공개 채널(anonymous-chat)로 보낸다 (DB 트리거).
-- 채팅 메시지는 신고할 수 있고, 관리자는 신고된 메시지에 한해 실제 작성자를 보고 지운다. 3일 지난 메시지는 지우되
-- 처리되지 않은 신고가 걸린 것은 남긴다. 탈퇴하면 메시지와 거기 걸린 신고가 외래 키로 함께 지워진다.
--
-- 오류 코드: KH020 메시지 길이(1~100자), KH021 5초에 한 번만 보낼 수 있음

create table public.chat_alias (
  day date not null,
  user_id uuid not null references public.profile (id) on delete cascade,
  number integer not null check (number >= 1),
  primary key (day, user_id),
  unique (day, number)
);

create index chat_alias_user_id_idx on public.chat_alias (user_id);

create table public.chat_message (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profile (id) on delete cascade,
  -- 보낸 날의 채팅 별명 번호 (익명 N)
  alias integer not null,
  body text not null check (char_length(body) between 1 and 100 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);

create index chat_message_created_at_idx on public.chat_message (created_at desc);
create index chat_message_author_created_idx on public.chat_message (author_id, created_at desc);

alter table public.chat_alias enable row level security;
alter table public.chat_message enable row level security;

revoke all on public.chat_alias, public.chat_message from anon, authenticated;
-- 관리자만, 신고된 메시지만 읽고 지운다 (아래 정책)
grant select, delete on public.chat_message to authenticated;

alter table public.report
  add column chat_message_id uuid references public.chat_message (id) on delete cascade,
  drop constraint report_check,
  add constraint report_one_target check (num_nonnulls(post_id, comment_id, chat_message_id) = 1),
  add unique (reporter_id, chat_message_id);

create index report_chat_message_id_idx on public.report (chat_message_id);

grant insert (chat_message_id) on public.report to authenticated;

-- 처리되지 않은, 다른 사람이 낸 신고가 걸린 채팅 메시지만. 관리자가 스스로 신고해서 작성자를 볼 수는 없고,
-- 신고를 닫으면 다시 가려진다.
create function public.is_reported_chat_message(target_message uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report r
    where r.chat_message_id = target_message and r.closed_at is null and r.reporter_id <> (select auth.uid())
  );
$$;

revoke execute on function public.is_reported_chat_message(uuid) from public, anon;
grant execute on function public.is_reported_chat_message(uuid) to authenticated;

create policy "관리자는 신고된 채팅 메시지를 읽는다"
  on public.chat_message for select to authenticated
  using (public.is_admin() and public.is_reported_chat_message(id));

create policy "관리자는 신고된 채팅 메시지를 지운다"
  on public.chat_message for delete to authenticated
  using (public.is_admin() and public.is_reported_chat_message(id));

-- 채팅 메시지를 보낸다: 로그인한 사용자만, 1~100자, 5초에 한 번. 반환값은 다른 사람에게 보이는 그대로(작성자 없음).
create function public.send_chat_message(message text)
returns table (id uuid, alias integer, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Seoul')::date;
  trimmed text := btrim(message);
  my_alias integer;
begin
  if me is null then
    raise exception '로그인한 사용자만 채팅할 수 있어요' using errcode = '42501';
  end if;
  if char_length(trimmed) not between 1 and 100 then
    raise exception '채팅 메시지는 1~100자로 써 주세요' using errcode = 'KH020';
  end if;

  -- One sender at a time per user, so two quick sends can't both pass the 5-second check.
  perform pg_advisory_xact_lock(hashtext('chat-sender:' || me));
  if exists (select 1 from public.chat_message m where m.author_id = me and m.created_at > now() - interval '5 seconds') then
    raise exception '5초에 한 번만 보낼 수 있어요' using errcode = 'KH021';
  end if;

  select a.number into my_alias from public.chat_alias a where a.day = today and a.user_id = me;
  if my_alias is null then
    -- Numbers are handed out one at a time per day, in the order people first send.
    perform pg_advisory_xact_lock(hashtext('chat-alias:' || today));
    insert into public.chat_alias (day, user_id, number)
    values (today, me, coalesce((select max(a.number) from public.chat_alias a where a.day = today), 0) + 1)
    returning number into my_alias;
  end if;

  return query
  insert into public.chat_message as m (author_id, alias, body)
  values (me, my_alias, trimmed)
  returning m.id, m.alias, m.body, m.created_at;
end;
$$;

-- 최근 채팅 메시지 100개, 오래된 것부터. 작성자 대신 내 메시지인지만 알려 준다.
create function public.recent_chat_messages()
returns table (id uuid, alias integer, body text, created_at timestamptz, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception '로그인한 사용자만 채팅할 수 있어요' using errcode = '42501';
  end if;
  return query
  select r.id, r.alias, r.body, r.created_at, r.mine
  from (
    select m.id, m.alias, m.body, m.created_at, m.author_id = (select auth.uid()) as mine
    from public.chat_message m
    order by m.created_at desc
    limit 100
  ) r
  order by r.created_at;
end;
$$;

revoke execute on function public.send_chat_message(text), public.recent_chat_messages() from public, anon;
grant execute on function public.send_chat_message(text), public.recent_chat_messages() to authenticated;

-- 새 메시지·지운 메시지를 Realtime 비공개 채널로 보낸다. 싣는 것은 recent_chat_messages()와 같은 익명 필드뿐이다.
-- (Realtime이 없는 환경에서는 보내지 않거나, realtime.send()가 경고만 남기고 넘어간다.)
create function public.broadcast_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'alias', new.alias, 'body', new.body, 'created_at', new.created_at),
      'message', 'anonymous-chat', true);
    return new;
  end if;
  perform realtime.send(jsonb_build_object('id', old.id), 'deleted', 'anonymous-chat', true);
  return old;
end;
$$;

create trigger chat_message_broadcast
  after insert or delete on public.chat_message
  for each row execute function public.broadcast_chat_message();

-- 비공개 채널 anonymous-chat: 로그인한 사용자는 듣고 접속(Presence)을 알리기만 한다. 메시지를 직접 보내지는 못한다.
-- realtime.messages가 없는 환경(Realtime을 띄우지 않은 로컬·CI)에서는 건너뛴다.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    create policy "로그인한 사용자는 익명 채팅을 듣는다"
      on realtime.messages for select to authenticated
      using ((select realtime.topic()) = 'anonymous-chat');
    create policy "로그인한 사용자는 익명 채팅에 접속을 알린다"
      on realtime.messages for insert to authenticated
      with check ((select realtime.topic()) = 'anonymous-chat' and extension = 'presence');
  end if;
end;
$$;

-- 3일 지난 채팅 메시지를 지운다 (처리되지 않은 신고가 걸린 것은 남긴다). 지난날의 채팅 별명도 지운다.
-- 반환값: 지운 메시지 수. pg_cron이 1시간마다 부른다.
create function public.purge_chat_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.chat_message m
  where m.created_at < now() - interval '3 days'
    and not exists (select 1 from public.report r where r.chat_message_id = m.id and r.closed_at is null);
  get diagnostics removed = row_count;
  delete from public.chat_alias where day < (now() at time zone 'Asia/Seoul')::date;
  return removed;
end;
$$;

revoke execute on function public.purge_chat_messages() from public, anon, authenticated;
grant execute on function public.purge_chat_messages() to service_role;

select cron.schedule('purge-chat-messages', '30 * * * *', 'select public.purge_chat_messages()');
