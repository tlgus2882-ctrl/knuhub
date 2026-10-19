"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runSelfCheck } from "./self-check-actions";

export function SelfCheckButton({ assignmentId, remaining, limit }: { assignmentId: string; remaining: number; limit: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || remaining <= 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              setError((await runSelfCheck(assignmentId)).error);
            })
          }
        >
          {pending ? "AI가 점검하는 중…" : "셀프 점검 받기"}
        </Button>
        <span className="text-sm text-muted-foreground">
          남은 횟수 {remaining}/{limit}
        </span>
      </div>
      {pending && <p className="text-sm text-muted-foreground">1분 정도 걸릴 수 있어요.</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
