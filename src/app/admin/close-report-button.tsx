"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeReport, deleteChatMessage } from "./admin-actions";

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

/** Deletes a reported 채팅 메시지 (and with it its 신고). */
export function DeleteChatMessageButton({ messageId }: { messageId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await deleteChatMessage(messageId)).error))}
      >
        {pending ? "지우는 중…" : "메시지 지우기"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
