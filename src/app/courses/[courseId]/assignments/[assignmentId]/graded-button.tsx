"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Grading } from "./first-check";
import { setGraded } from "./grading-actions";

/** 채점 완료 now, or take it back; while it is set to happen by itself, both are offered. */
export function GradedButton({ assignmentId, state }: { assignmentId: string; state: Grading["state"] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (graded: boolean) => startTransition(async () => setError((await setGraded(assignmentId, graded)).error));

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {state !== "done" && (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(true)}>
          {pending ? "저장 중…" : state === "scheduled" ? "지금 채점 완료" : "채점 완료"}
        </Button>
      )}
      {state !== "none" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>
          {state === "scheduled" ? "자동 채점 완료 취소" : "채점 완료 취소"}
        </Button>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
