"use client";

import { useState, useTransition } from "react";
import { ASSIGNMENT_FILE_BUCKET, ASSIGNMENT_FILE_MAX_BYTES, assignmentFileObjectName } from "@/lib/assignments/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { attachAssignmentFile } from "./attachment-actions";

const UPLOAD_FAILED = "올리지 못했어요. 이 과목의 담당 교수나 조교인지 확인해 주세요.";

// Uploads go straight from the browser to Storage (docs/adr/0002); the server action then attaches them.
export function AttachmentUpload({ assignmentId }: { assignmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function attach(files: File[]) {
    const tooLarge = files.filter((file) => file.size > ASSIGNMENT_FILE_MAX_BYTES);
    if (tooLarge.length) {
      setError(`첨부파일은 하나에 20MB까지예요: ${tooLarge.map((f) => f.name).join(", ")}`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const storage = createBrowserSupabase().storage.from(ASSIGNMENT_FILE_BUCKET);
      for (const [done, file] of files.entries()) {
        const failure = await attachOne(file);
        if (failure) {
          const skipped = files.length - done - 1;
          setError(
            `${file.name}: ${failure}` +
              (files.length > 1 ? ` (${files.length}개 중 ${done}개 첨부${skipped ? `, ${skipped}개는 올리지 않음` : ""})` : ""),
          );
          return;
        }
      }

      async function attachOne(file: File): Promise<string | null> {
        const storagePath = assignmentFileObjectName(assignmentId, crypto.randomUUID());
        const { error: uploadError } = await storage.upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (uploadError) return UPLOAD_FAILED;

        let result: { error: string | null };
        try {
          result = await attachAssignmentFile(assignmentId, storagePath, file.name);
        } catch {
          result = { error: "첨부하지 못했어요. 잠시 뒤에 다시 해 주세요." };
        }
        // Not attached: remove the object this browser just uploaded (best effort).
        if (result.error) await storage.remove([storagePath]);
        return result.error;
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
