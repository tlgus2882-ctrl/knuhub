"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteComment, deletePost, type BoardFormState } from "./actions";

const initial: BoardFormState = { error: null };

const KIND = {
  post_id: { action: deletePost, confirm: "이 글을 지울까요? 댓글도 함께 지워져요.", label: "글 지우기" },
  comment_id: { action: deleteComment, confirm: "이 댓글을 지울까요?", label: "댓글 지우기" },
};

/** 지우기 for a post or a comment. `stay` keeps the 관리자 페이지 open after a post is deleted. */
export function DeleteButton({ target, stay }: { target: { post_id: string } | { comment_id: string }; stay?: boolean }) {
  const [name, id] = Object.entries(target)[0] as [keyof typeof KIND, string];
  const kind = KIND[name];
  const [state, action, pending] = useActionState(kind.action, initial);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(kind.confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name={name} value={id} />
      {stay && <input type="hidden" name="stay" value="1" />}
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        {pending ? "지우는 중…" : kind.label}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
