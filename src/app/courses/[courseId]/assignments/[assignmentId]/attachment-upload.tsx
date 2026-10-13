"use client";

import { useState, useTransition } from "react";
import { attachFiles, oversizedMessage, oversizedFiles } from "../attach-files";

export function AttachmentUpload({ assignmentId }: { assignmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function attach(files: File[]) {
    const tooLarge = oversizedFiles(files);
    if (tooLarge.length) return setError(oversizedMessage(tooLarge));

    startTransition(async () => {
      setError(null);
      setError(await attachFiles(assignmentId, files));
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="cursor-pointer self-start rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
        {pending ? "올리는 중…" : "파일 첨부하기"}
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const picked = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (picked.length) attach(picked);
          }}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
