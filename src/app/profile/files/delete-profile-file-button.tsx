"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteProfileFile } from "./actions";

export function DeleteProfileFileButton({ fileId, name }: { fileId: string; name: string }) {
  const [state, action, pending] = useActionState(deleteProfileFile, { error: null });
  return (
    <form action={action} onSubmit={(e) => !confirm(`${name}을(를) 지울까요?`) && e.preventDefault()}>
      <input type="hidden" name="file_id" value={fileId} />
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        {pending ? "지우는 중…" : "지우기"}
      </Button>
      {state.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}
