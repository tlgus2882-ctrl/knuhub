"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { answerAppeal, createAppeal, withdrawAppeal, type AppealFormState } from "./appeal-actions";

const initial: AppealFormState = { error: null };

const textareaClass =
  "rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** A "점수 이의신청" button that opens the form for writing one. */
export function AppealForm({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAppeal, initial);

  if (!open) {
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          점수 이의신청
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <textarea
        name="body"
        rows={4}
        required
        maxLength={2000}
        placeholder="어떤 채점 항목의 점수가 왜 다르다고 생각하는지 적어 주세요."
        aria-label="이의신청 내용"
        className={textareaClass}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "보내는 중…" : "이의신청 보내기"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </form>
  );
}

export function WithdrawAppealButton({ assignmentId }: { assignmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await withdrawAppeal(assignmentId)).error))}
      >
        {pending ? "거두는 중…" : "이의신청 거두기"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}

export function AnswerForm({ assignmentId, studentId }: { assignmentId: string; studentId: string }) {
  const [state, action, pending] = useActionState(answerAppeal, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="student_id" value={studentId} />
      <textarea
        name="answer"
        rows={3}
        required
        maxLength={2000}
        placeholder="확인한 결과와 점수를 바꾸는지 적어 주세요."
        aria-label="이의신청 답변"
        className={textareaClass}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : "답변하기"}
        </Button>
      </div>
    </form>
  );
}
