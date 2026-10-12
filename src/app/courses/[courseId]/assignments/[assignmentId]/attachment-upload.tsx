"use client";

import { useState, useTransition } from "react";
import { ASSIGNMENT_FILE_BUCKET, ASSIGNMENT_FILE_MAX_BYTES, assignmentFileObjectName } from "@/lib/assignments/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { attachAssignmentFile } from "./attachment-actions";

// Uploads go straight from the browser to Storage (docs/adr/0002); the server action then attaches them.
export function AttachmentUpload({ assignmentId }: { assignmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function attach(files: File[]) {
    startTransition(async () => {
      setError(null);
      const storage = createBrowserSupabase().storage.from(ASSIGNMENT_FILE_BUCKET);
      for (const file of files) {
        if (file.size > ASSIGNMENT_FILE_MAX_BYTES) {
          setError(`${file.name}: 첨부파일은 하나에 20MB까지 올릴 수 있어요.`);
          return;
        }
        const storagePath = assignmentFileObjectName(assignmentId, crypto.randomUUID());
        const { error: uploadError } = await storage.upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (uploadError) {
          setError(`${file.name}: 올리지 못했어요. 이 과목의 담당 교수나 조교인지 확인해 주세요.`);
          return;
        }
        const result = await attachAssignmentFile(assignmentId, storagePath, file.name);
        if (result.error) {
          setError(`${file.name}: ${result.error}`);
          return;
        }
      }
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
