"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteSubmission, type SubmissionActionState } from "./submission-actions";

const initial: SubmissionActionState = { error: null };

export function DeleteSubmissionForm({ assignmentId }: { assignmentId: string }) {
  const [state, action, pending] = useActionState(deleteSubmission, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "지우는 중…" : "제출 취소 (삭제)"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
