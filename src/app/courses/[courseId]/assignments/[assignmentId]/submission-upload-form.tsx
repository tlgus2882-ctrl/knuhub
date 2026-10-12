"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format-bytes";
import { pickedFromDrop, pickedFromInput, readPicked } from "@/lib/submissions/collect-files";
import { prepareUpload, UploadTooLargeError, type PreparedFile } from "@/lib/submissions/prepare-upload";
import { SUBMISSION_BUCKET, submissionObjectName } from "@/lib/submissions/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { submitUploadedFiles, type UploadedFile } from "./submission-actions";

type Props = { assignmentId: string; studentId: string; resubmit: boolean };

const TOO_LARGE = "node_modules, .git 같은 폴더를 빼고도 20MB가 넘어서 제출할 수 없어요.";
const PARALLEL_UPLOADS = 4;
const PREVIEW_COUNT = 8;

// Uploads go straight from the browser to Storage (docs/adr/0002); the server
// action then makes them the 제출물.
export function SubmissionUploadForm({ assignmentId, studentId, resubmit }: Props) {
  const [files, setFiles] = useState<PreparedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function prepare(collect: () => Promise<Parameters<typeof readPicked>[0]>) {
    setError(null);
    setFiles(null);
    try {
      const result = prepareUpload(await readPicked(await collect()));
      if (result.ok) setFiles(result.files);
      else setError(result.reason === "too-large" ? TOO_LARGE : "제출할 파일이 없어요. (제외되는 폴더만 들어 있어요)");
    } catch (e) {
      setError(e instanceof UploadTooLargeError ? TOO_LARGE : "파일을 읽지 못했어요. zip이 손상되지 않았는지 확인해 주세요.");
    }
  }

  function submit() {
    if (!files) return;
    startTransition(async () => {
      setError(null);
      const attempt = crypto.randomUUID();
      const storage = createBrowserSupabase().storage.from(SUBMISSION_BUCKET);
      const uploaded: UploadedFile[] = files.map((file, index) => ({
        path: file.path,
        storage_path: submissionObjectName(assignmentId, studentId, attempt, index),
        kind: file.kind,
      }));

      let done = 0;
      let failed = false;
      const queue = [...files.keys()];
      const worker = async () => {
        for (let index = queue.shift(); index !== undefined && !failed; index = queue.shift()) {
          const { error: uploadError } = await storage.upload(uploaded[index].storage_path, files[index].data, {
            contentType: files[index].kind === "text" ? "text/plain;charset=utf-8" : "application/octet-stream",
          });
          if (uploadError) failed = true;
          setProgress(`올리는 중 ${++done}/${files.length}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, files.length) }, worker));
      setProgress(null);

      if (failed) {
        setError("파일을 올리지 못했어요. 마감이 지났는지 확인하고 다시 해 주세요.");
        return;
      }
      const result = await submitUploadedFiles(assignmentId, uploaded);
      if (result.error) return setError(result.error);
      setFiles(null);
    });
  }

  const totalBytes = files?.reduce((sum, f) => sum + f.data.byteLength, 0) ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const pick = pickedFromDrop(event.dataTransfer.items);
          void prepare(() => pick);
        }}
        className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          dragging ? "border-ring bg-muted" : "border-input"
        }`}
      >
        <p>
          {resubmit ? "다시 제출할" : "제출할"} 파일이나 폴더, zip을 여기에 끌어다 놓거나 골라 주세요.
          <span className="block text-xs text-muted-foreground">
            zip은 풀어서 올려요. node_modules, .git 같은 폴더는 빼고, 합쳐서 20MB까지 제출할 수 있어요.
          </span>
        </p>
        <div className="flex gap-2">
          <PickButton label="파일·zip 고르기" onPick={(list) => prepare(async () => pickedFromInput(list))} />
          <PickButton label="폴더 고르기" directory onPick={(list) => prepare(async () => pickedFromInput(list))} />
        </div>
      </div>

      {files && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            파일 {files.length}개 · {formatBytes(totalBytes)}
          </p>
          <ul className="text-muted-foreground">
            {files.slice(0, PREVIEW_COUNT).map((f) => (
              <li key={f.path}>
                {f.path} {f.kind === "binary" && <span className="text-xs">(바이너리)</span>}
              </li>
            ))}
            {files.length > PREVIEW_COUNT && <li>외 {files.length - PREVIEW_COUNT}개</li>}
          </ul>
          {resubmit && <p className="text-xs text-muted-foreground">다시 제출하면 지금 파일은 모두 지워지고 이 파일들로 바뀌어요.</p>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={submit} disabled={!files || pending} className="self-start">
        {pending ? (progress ?? "제출 중…") : resubmit ? "다시 제출하기" : "제출하기"}
      </Button>
    </div>
  );
}

function PickButton({ label, directory, onPick }: { label: string; directory?: boolean; onPick: (files: File[]) => void }) {
  return (
    <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
      {label}
      <input
        type="file"
        multiple
        className="sr-only"
        {...(directory ? { webkitdirectory: "" } : {})}
        onChange={(event) => {
          // Copy before clearing the input (so the same files can be picked again).
          const picked = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (picked.length) onPick(picked);
        }}
      />
    </label>
  );
}
