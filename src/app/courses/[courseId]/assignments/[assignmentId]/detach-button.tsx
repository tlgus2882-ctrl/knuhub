"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { detachAssignmentFile, type AttachmentActionState } from "./attachment-actions";

const initial: AttachmentActionState = { error: null };

export function DetachButton({ fileId }: { fileId: string }) {
  const [state, action, pending] = useActionState(detachAssignmentFile, initial);

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="file_id" value={fileId} />
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        {pending ? "지우는 중…" : "지우기"}
      </Button>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
