"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { advanceFirstCheck, requestFirstCheck, type FirstCheckProgress } from "./first-check-actions";

type Props = { assignmentId: string; total: number; remaining: number };

// Runs 1차 검사 from the browser: queue the 제출물, then keep asking the server to check the next few.
export function FirstCheckPanel({ assignmentId, total: initialTotal, remaining: initialRemaining }: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState<FirstCheckProgress>({ error: null, total: initialTotal, remaining: initialRemaining });
  const [message, setMessage] = useState<string | null>(null);
  const [running, startRun] = useTransition();
  const inProgress = progress.remaining > 0;

  function run() {
    setMessage(null);
    startRun(async () => {
      let state = inProgress ? progress : await requestFirstCheck(assignmentId);
      setProgress(state);
      if (!state.error && state.total === 0) return setMessage("검사할 제출물이 없어요. 모두 최신 결과가 있어요.");
      while (!state.error && state.remaining > 0) {
        state = await advanceFirstCheck(assignmentId);
        setProgress(state);
        router.refresh();
      }
      if (!state.error) setMessage("1차 검사를 마쳤어요.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={running} onClick={run}>
          {running ? "검사하는 중…" : inProgress ? "이어서 검사하기" : "전체 검사"}
        </Button>
        {progress.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {progress.total - progress.remaining}/{progress.total}개 끝남
          </span>
        )}
      </div>
      {running && <p className="text-sm text-muted-foreground">검사하는 동안 이 화면을 열어 두세요. 닫으면 멈추고, 다시 열어 이어서 할 수 있어요.</p>}
      {progress.error && (
        <p className="text-sm text-destructive" role="alert">
          {progress.error}
        </p>
      )}
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
