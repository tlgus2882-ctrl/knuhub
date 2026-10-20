"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createReport, type BoardFormState } from "./actions";

const initial: BoardFormState = { error: null };

/** 신고 for a post or a comment: a reason, then it goes to the 관리자 페이지. */
export function ReportButton({ target }: { target: { post_id: string } | { comment_id: string } }) {
  const [state, action, pending] = useActionState(createReport, initial);
  const [name, id] = Object.entries(target)[0];

  if (state.savedAt) return <p className="text-xs text-muted-foreground">신고했어요. 관리자가 확인할 거예요.</p>;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">신고</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name={name} value={id} />
        <Input name="reason" required maxLength={1000} placeholder="신고 사유 (예: 광고, 욕설)" aria-label="신고 사유" className="max-w-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "보내는 중…" : "신고하기"}
        </Button>
        {state.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
      </form>
    </details>
  );
}
