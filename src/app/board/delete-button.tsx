"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteComment, deletePost, type BoardFormState } from "./actions";

const initial: BoardFormState = { error: null };

/** 지우기 for a post or a comment. `stay` keeps the 관리자 페이지 open after a post is deleted. */
export function DeleteButton({ target, stay }: { target: { post_id: string } | { comment_id: string }; stay?: boolean }) {
  const [name, id] = Object.entries(target)[0];
  const [state, action, pending] = useActionState(name === "post_id" ? deletePost : deleteComment, initial);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(name === "post_id" ? "이 글을 지울까요? 댓글도 함께 지워져요." : "이 댓글을 지울까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name={name} value={id} />
      {stay && <input type="hidden" name="stay" value="1" />}
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        {pending ? "지우는 중…" : name === "post_id" ? "글 지우기" : "댓글 지우기"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
