"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createReview, updateReview, type ReviewFormState } from "./review-actions";

const initial: ReviewFormState = { error: null };

type Props =
  | { submissionId: string; review?: undefined; onDone?: undefined }
  | { submissionId?: undefined; review: { id: string; body: string }; onDone: () => void };

/** Writes a new review, or edits `review` when given. */
export function ReviewForm({ submissionId, review, onDone }: Props) {
  const [state, action, pending] = useActionState(review ? updateReview : createReview, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.saved) return;
    if (review) onDone();
    else formRef.current?.reset();
  }, [state.saved, review, onDone]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {review ? (
        <input type="hidden" name="review_id" value={review.id} />
      ) : (
        <input type="hidden" name="submission_id" value={submissionId} />
      )}
      <textarea
        name="body"
        rows={review ? 4 : 3}
        defaultValue={review?.body}
        required
        maxLength={10000}
        placeholder="잘한 점, 고칠 점을 남겨 주세요."
        aria-label={review ? "리뷰 고치기" : "리뷰 쓰기"}
        className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : review ? "고친 내용 저장" : "리뷰 남기기"}
        </Button>
        {review && (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            취소
          </Button>
        )}
      </div>
    </form>
  );
}
