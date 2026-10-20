"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeReport } from "./admin-actions";

export function CloseReportButton({ reportId }: { reportId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await closeReport(reportId)).error))}
      >
        {pending ? "닫는 중…" : "신고 닫기"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
