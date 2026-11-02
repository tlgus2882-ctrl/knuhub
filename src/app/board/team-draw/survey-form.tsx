"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Question } from "@/lib/team-draw/form-teams";
import { answerSurvey, type TeamDrawFormState } from "./actions";

const initial: TeamDrawFormState = { error: null };

type Props = { postId: string; questions: Question[]; answers: string[] | null };

/** A 수강생's 설문 응답, which they may change until the 설문 마감. */
export function SurveyForm({ postId, questions, answers }: Props) {
  const [state, action, pending] = useActionState(answerSurvey, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="post_id" value={postId} />
      <input type="hidden" name="question_count" value={questions.length} />
      {questions.map((q, i) =>
        q.kind === "choice" ? (
          <fieldset key={i} className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">{q.title}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options!.map((option) => (
                <label
                  key={option}
                  className="cursor-pointer rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input type="radio" name={`answer-${i}`} value={option} required defaultChecked={answers?.[i] === option} className="sr-only" />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div key={i} className="flex flex-col gap-1.5">
            <label htmlFor={`answer-${i}`} className="text-sm font-medium">
              {q.title}
            </label>
            <textarea
              id={`answer-${i}`}
              name={`answer-${i}`}
              rows={3}
              required
              maxLength={2000}
              defaultValue={answers?.[i]}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        ),
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.savedAt && !state.error && (
        <p className="text-sm text-muted-foreground" role="status">
          응답을 저장했어요. 마감 전까지 고칠 수 있어요.
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "저장 중…" : answers ? "응답 고치기" : "응답 내기"}
      </Button>
    </form>
  );
}
