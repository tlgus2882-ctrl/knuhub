"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { SUBMISSION_BUCKET, SUBMISSION_MAX_BYTES, submissionObjectName } from "@/lib/submissions/storage";
import { submitUploadedFiles } from "./submission-actions";

type Props = { assignmentId: string; studentId: string; resubmit: boolean };

// Uploads go straight from the browser to Storage (docs/adr/0002); the server
// action then makes them the submission.
export function SubmitFileForm({ assignmentId, studentId, resubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("제출할 파일을 골라 주세요.");
    if (file.size > SUBMISSION_MAX_BYTES) return setError("제출물은 20MB를 넘을 수 없어요.");
    const form = event.currentTarget;

    startTransition(async () => {
      setError(null);
      const storagePath = submissionObjectName(assignmentId, studentId, crypto.randomUUID(), 0);
      const { error: uploadError } = await createBrowserSupabase()
        .storage.from(SUBMISSION_BUCKET)
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

      if (uploadError) {
        setError("파일을 올리지 못했어요. 마감이 지났는지 확인해 주세요.");
        return;
      }

      const result = await submitUploadedFiles(assignmentId, [{ path: file.name, storage_path: storagePath }]);
      if (result.error) return setError(result.error);
      form.reset();
      setFile(null);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="submission-file">{resubmit ? "다른 파일로 다시 제출" : "제출할 파일"}</Label>
        <Input
          id="submission-file"
          type="file"
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          required
        />
        {resubmit && <p className="text-xs text-muted-foreground">다시 제출하면 지금 파일은 지워지고 새 파일로 바뀌어요.</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "제출 중…" : resubmit ? "다시 제출하기" : "제출하기"}
      </Button>
    </form>
  );
}
