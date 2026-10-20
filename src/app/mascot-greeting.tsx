"use client";

import Image from "next/image";
import { useState } from "react";

const LINES = [
  (name: string) => `${name}님, 안녕하세요!`,
  (name: string) => `${name}님, 오늘도 과제 화이팅이에요!`,
  () => "마감 전에 셀프 점검 한 번 받아 보는 건 어때요?",
  () => "다른 사람 제출물에 리뷰를 남기면 서로 실력이 늘어요.",
  (name: string) => `${name}님, 물 한 잔 마시고 시작해요!`,
  () => "막히는 건 메인 게시판 질문 말머리로 물어봐요.",
  () => "커밋은 자주, 제출은 마감 전에!",
  (name: string) => `${name}님이 올 줄 알았어요. 반가워요!`,
  () => "이번 주 교수 추천 제출물도 구경해 보세요.",
  () => "오류 메시지는 무서워 보여도 힌트가 들어 있어요.",
];

/** The 강남대 mascot greeting the signed-in user; it says something else each visit and on every click. */
/** `seed` in [0, 1) picks the first line (chosen per request on the server). */
export function MascotGreeting({ name, seed }: { name: string; seed: number }) {
  const [line, setLine] = useState(Math.floor(seed * LINES.length) % LINES.length);

  return (
    <div className="flex items-end gap-3">
      <button
        type="button"
        onClick={() => setLine((current) => (current + 1 + Math.floor(Math.random() * (LINES.length - 1))) % LINES.length)}
        aria-label="캐릭터에게 다른 말 듣기"
        className="shrink-0 rounded-xl transition-transform hover:-rotate-3 active:scale-95"
      >
        <Image src="/lambu.png" alt="" width={205} height={342} className="h-28 w-auto" priority />
      </button>
      <p
        aria-live="polite"
        className="relative mb-8 rounded-2xl border bg-background px-4 py-3 text-base shadow-sm before:absolute before:bottom-3 before:-left-2 before:size-4 before:rotate-45 before:border-b before:border-l before:bg-background"
      >
        {LINES[line](name)}
      </p>
    </div>
  );
}
