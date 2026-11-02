"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatKstTime, kstToday } from "@/lib/time";
import { loadChatMessages, reportChatMessage, sendChatMessage, type ChatMessage } from "./actions";

const CHANNEL = "anonymous-chat";
/** send_chat_message() takes 1~100 characters (code points, as the DB counts them). */
const MAX_LENGTH = 100;
/** recent_chat_messages() returns this many; the window keeps no more. */
const HISTORY_LIMIT = 100;
const REASONS = ["욕설·비방", "도배", "개인정보"];

/** My 채팅 별명 today, so my messages sent from another tab are still marked mine. */
type MyAlias = { day: string; alias: number };
const dayOf = (iso: string) => kstToday(new Date(iso));

/**
 * 익명 채팅: a bubble that opens a small window (the lower half of the screen on phones). It lives in the
 * root layout, so it stays open across pages. New and deleted 채팅 메시지 arrive over a private Realtime
 * channel the DB broadcasts to, carrying only what recent_chat_messages() shows; sending and reading
 * go through Server Actions (docs/adr/0002).
 */
export function ChatWindow({ presenceKey }: { presenceKey: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [online, setOnline] = useState(0);
  const [unread, setUnread] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const openRef = useRef(open);
  const myAliasRef = useRef<MyAlias | null>(null);
  const length = [...draft.trim()].length;
  const tooLong = length > MAX_LENGTH;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase.channel(CHANNEL, { config: { private: true, presence: { key: presenceKey } } });
    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const sent = payload as Omit<ChatMessage, "mine">;
        const me = myAliasRef.current;
        const message = { ...sent, mine: me !== null && me.alias === sent.alias && me.day === dayOf(sent.created_at) };
        setMessages((list) => (list === null || list.some((m) => m.id === message.id) ? list : [...list, message].slice(-HISTORY_LIMIT)));
        if (!openRef.current && !message.mine) setUnread(true);
      })
      .on("broadcast", { event: "deleted" }, ({ payload }) => {
        setMessages((list) => list?.filter((m) => m.id !== (payload as { id: string }).id) ?? null);
      })
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(channel.presenceState()).length));
    // Private channels need the signed-in user's token before subscribing.
    supabase.realtime.setAuth().then(() =>
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({});
      }),
    );
    return () => {
      supabase.removeChannel(channel);
    };
  }, [presenceKey]);

  useEffect(() => {
    if (!open || messages !== null) return;
    loadChatMessages().then((list) => {
      const today = kstToday(new Date());
      const mine = list.findLast((m) => m.mine && dayOf(m.created_at) === today);
      if (mine) myAliasRef.current = { day: today, alias: mine.alias };
      setMessages(list);
    });
  }, [open, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || tooLong) return;
    startSend(async () => {
      const result = await sendChatMessage(text);
      setError(result.error);
      if (!result.message) return;
      setDraft("");
      const sent = result.message;
      myAliasRef.current = { day: dayOf(sent.created_at), alias: sent.alias };
      // The broadcast may have arrived first; keep one copy, marked mine.
      setMessages((list) => [...(list ?? []).filter((m) => m.id !== sent.id), sent].slice(-HISTORY_LIMIT));
    });
  }

  return (
    <>
      {open && (
        <section
          aria-label="익명 채팅"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[50vh] flex-col border-t bg-background shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-20 sm:h-[28rem] sm:w-80 sm:rounded-xl sm:border"
        >
          <header className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">
              익명 채팅 <span className="font-normal text-muted-foreground">· {online}명 접속 중</span>
            </p>
            <button type="button" aria-label="채팅 닫기" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
              <X className="size-4" />
            </button>
          </header>
          <ol ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2 text-sm">
            {messages === null && <li className="text-muted-foreground">불러오는 중…</li>}
            {messages?.length === 0 && <li className="text-muted-foreground">아직 메시지가 없어요. 먼저 인사해 보세요.</li>}
            {messages?.map((m) => <Message key={m.id} message={m} />)}
          </ol>
          <form onSubmit={send} className="flex flex-col gap-1 border-t p-2">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`메시지 (${MAX_LENGTH}자까지)`}
                aria-label="채팅 메시지"
                className="min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button type="submit" size="sm" disabled={sending || !length || tooLong}>
                보내기
              </Button>
            </div>
            {tooLong && (
              <p className="text-xs text-destructive" role="alert">
                {MAX_LENGTH}자까지 보낼 수 있어요. 지금 {length}자예요.
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">이름 대신 오늘의 별명이 보여요. 보낸 메시지는 지울 수 없고 3일 뒤 사라져요.</p>
          </form>
        </section>
      )}
      <button
        type="button"
        aria-label={open ? "익명 채팅 닫기" : unread ? "익명 채팅 열기 (새 메시지)" : "익명 채팅 열기"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setUnread(false);
        }}
        className={`fixed right-4 bottom-4 z-30 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 ${open ? "max-sm:hidden" : ""}`}
      >
        <MessageCircle className="size-6" />
        {unread && <span className="absolute top-1 right-1 size-3 rounded-full border-2 border-background bg-red-500" />}
      </button>
    </>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startReport] = useTransition();

  const report = (reason: string) =>
    startReport(async () => {
      const { error } = await reportChatMessage(message.id, reason);
      setNote(error ?? "신고했어요. 관리자가 확인할 거예요.");
      setReporting(false);
    });

  return (
    <li className={`flex flex-col gap-0.5 ${message.mine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-muted-foreground">
        {message.mine ? `나 (익명 ${message.alias})` : `익명 ${message.alias}`} · {formatKstTime(message.created_at)}
        {!message.mine && !note && (
          <button type="button" onClick={() => setReporting(!reporting)} className="ml-1 hover:text-foreground hover:underline">
            신고
          </button>
        )}
      </span>
      <p className={`max-w-[85%] rounded-lg px-2 py-1 break-words whitespace-pre-wrap ${message.mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {message.body}
      </p>
      {reporting && <ReportReasons disabled={pending} onPick={report} />}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </li>
  );
}

function ReportReasons({ disabled, onPick }: { disabled: boolean; onPick: (reason: string) => void }) {
  const [other, setOther] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {REASONS.map((reason) => (
        <button key={reason} type="button" disabled={disabled} onClick={() => onPick(reason)} className="rounded-full border px-2 py-0.5 hover:bg-muted">
          {reason}
        </button>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (other.trim()) onPick(other.trim());
        }}
        className="flex gap-1"
      >
        <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} placeholder="기타 (직접 쓰기)" aria-label="기타 신고 사유" className="w-28 rounded border border-input bg-transparent px-1" />
        <button type="submit" disabled={disabled || !other.trim()} className="rounded-full border px-2 py-0.5 hover:bg-muted">
          신고
        </button>
      </form>
    </div>
  );
}
