"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format-bytes";
import { pickedFromDrop, pickedFromInput, readPicked, type PickedFile } from "@/lib/submissions/collect-files";
import {
  prepareUpload,
  SUBMISSION_MAX_FILES,
  UploadTooLargeError,
  type PreparedUpload,
} from "@/lib/submissions/prepare-upload";
import { discardUploaded, submissionStorage, uploadPrepared } from "@/lib/submissions/upload";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { submitUploadedFiles } from "./submission-actions";

type Props = { assignmentId: string; studentId: string; resubmit: boolean };

const TOO_LARGE = "node_modules, .git 같은 폴더를 빼고도 20MB가 넘어서 제출할 수 없어요.";
const PREPARE_ERRORS: Record<Exclude<PreparedUpload, { ok: true }>["reason"], string> = {
  "too-large": TOO_LARGE,
  empty: "제출할 파일이 없어요. (제외되는 폴더만 들어 있어요)",
  "too-many-files": `파일이 ${SUBMISSION_MAX_FILES}개를 넘어서 제출할 수 없어요. 빌드 결과물 같은 폴더를 빼 주세요.`,
  "duplicate-paths": "경로가 같은 파일이 여러 개 있어요. 폴더 구조를 확인해 주세요.",
};
const PREVIEW_COUNT = 8;

// Uploads go straight from the browser to Storage (docs/adr/0002); the server
// action then makes them the 제출물.
export function SubmissionUploadForm({ assignmentId, studentId, resubmit }: Props) {
  const [prepared, setPrepared] = useState<Extract<PreparedUpload, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function prepare(picking: Promise<PickedFile[]>) {
    setError(null);
    setPrepared(null);
    try {
      const result = prepareUpload(await readPicked(await picking));
      if (result.ok) setPrepared(result);
      else setError(PREPARE_ERRORS[result.reason]);
    } catch (e) {
      setError(e instanceof UploadTooLargeError ? TOO_LARGE : "파일을 읽지 못했어요. zip이 손상되지 않았는지 확인해 주세요.");
    }
  }

  function submit() {
    if (!prepared) return;
    const { files } = prepared;
    startTransition(async () => {
      setError(null);
      const storage = submissionStorage(createBrowserSupabase());
      const uploaded = await uploadPrepared(storage, { assignmentId, studentId }, files, (done) =>
        setProgress(`올리는 중 ${done}/${files.length}`),
      );
      setProgress(null);

      if (!uploaded) {
        setError("파일을 올리지 못했어요. 마감이 지나지 않았는지, 인터넷 연결을 확인하고 다시 해 주세요.");
        return;
      }
      const result = await submitUploadedFiles(assignmentId, uploaded);
      if (result.error) {
        await discardUploaded(storage, uploaded);
        setError(result.error);
        return;
      }
      setPrepared(null);
    });
  }

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
          void prepare(pickedFromDrop(event.dataTransfer.items));
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
          <PickButton label="파일·zip 고르기" onPick={(list) => prepare(Promise.resolve(pickedFromInput(list)))} />
          <PickButton label="폴더 고르기" directory onPick={(list) => prepare(Promise.resolve(pickedFromInput(list)))} />
        </div>
      </div>

      {prepared && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            파일 {prepared.files.length}개 · {formatBytes(prepared.totalBytes)}
          </p>
          <ul className="text-muted-foreground">
            {prepared.files.slice(0, PREVIEW_COUNT).map((f) => (
              <li key={f.path}>
                {f.path} {f.kind === "binary" && <span className="text-xs">(바이너리)</span>}
              </li>
            ))}
            {prepared.files.length > PREVIEW_COUNT && <li>외 {prepared.files.length - PREVIEW_COUNT}개</li>}
          </ul>
          {resubmit && <p className="text-xs text-muted-foreground">다시 제출하면 지금 파일은 모두 지워지고 이 파일들로 바뀌어요.</p>}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={submit} disabled={!prepared || pending} className="self-start">
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
