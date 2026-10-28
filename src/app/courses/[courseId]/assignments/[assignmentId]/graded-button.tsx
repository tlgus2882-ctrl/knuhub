"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setGraded } from "./grading-actions";

export function GradedButton({ assignmentId, graded }: { assignmentId: string; graded: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={graded ? "outline" : "default"}
        disabled={pending}
        onClick={() => startTransition(async () => setError((await setGraded(assignmentId, !graded)).error))}
      >
        {pending ? "저장 중…" : graded ? "채점 완료 취소" : "채점 완료"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
