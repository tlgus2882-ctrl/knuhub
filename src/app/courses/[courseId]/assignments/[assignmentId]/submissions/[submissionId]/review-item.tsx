"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteReview, type ReviewFormState } from "./review-actions";
import { ReviewForm } from "./review-form";

const initial: ReviewFormState = { error: null };

type Props = {
  review: { id: string; body: string; authorName: string; writtenAt: string; edited: boolean };
  canEdit: boolean;
  canDelete: boolean;
};

export function ReviewItem({ review, canEdit, canDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, remove, removing] = useActionState(deleteReview, initial);

  return (
    <li className="flex flex-col gap-2 p-4">
      <p className="text-sm">
        <span className="font-medium">{review.authorName}</span>{" "}
        <span className="text-muted-foreground">
          · {review.writtenAt}
          {review.edited && " (고침)"}
        </span>
      </p>
      {editing ? (
        <ReviewForm review={review} onDone={() => setEditing(false)} />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{review.body}</p>
      )}
      {!editing && (canEdit || canDelete) && (
        <div className="flex gap-2">
          {canEdit && (
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(true)}>
              고치기
            </Button>
          )}
          {canDelete && (
            <form action={remove}>
              <input type="hidden" name="review_id" value={review.id} />
              <Button type="submit" size="xs" variant="ghost" disabled={removing}>
                {removing ? "지우는 중…" : "지우기"}
              </Button>
            </form>
          )}
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </li>
  );
}
