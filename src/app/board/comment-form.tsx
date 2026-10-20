"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createComment, updateComment, type BoardFormState } from "./actions";

const initial: BoardFormState = { error: null };

type Props =
  | { postId: string; comment?: undefined; onDone?: undefined }
  | { postId?: undefined; comment: { id: string; body: string }; onDone: () => void };

/** Writes a new comment, or edits `comment` when given. */
export function CommentForm({ postId, comment, onDone }: Props) {
  const [state, action, pending] = useActionState(comment ? updateComment : createComment, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    if (comment) onDone();
    else formRef.current?.reset();
  }, [state.savedAt, comment, onDone]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {comment ? (
        <input type="hidden" name="comment_id" value={comment.id} />
      ) : (
        <input type="hidden" name="post_id" value={postId} />
      )}
      <textarea
        name="body"
        rows={3}
        defaultValue={comment?.body}
        required
        maxLength={5000}
        aria-label={comment ? "댓글 고치기" : "댓글 쓰기"}
        placeholder="댓글을 남겨 주세요. 내 이름이 보여요."
        className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "저장 중…" : comment ? "고친 내용 저장" : "댓글 달기"}
        </Button>
        {comment && (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            취소
          </Button>
        )}
      </div>
    </form>
  );
}
