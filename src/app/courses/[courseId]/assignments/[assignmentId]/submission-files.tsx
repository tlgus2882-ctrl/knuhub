import { FileText } from "lucide-react";
import Link from "next/link";
import { formatBytes } from "@/lib/format-bytes";
import type { Tables } from "@/lib/supabase/database.types";

export type SubmissionFile = Pick<Tables<"submission_file">, "path" | "size" | "storage_path">;

/** How many files show before the rest fold under "외 N개 더 보기". */
const SHOWN = 5;

/** The 제출물's files as a file list, each opening the code viewer at that file. */
export function SubmissionFileList({ files, hrefFor }: { files: SubmissionFile[]; hrefFor: (path: string) => string }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const row = (file: SubmissionFile) => (
    <li key={file.storage_path} className="border-t">
      <Link href={hrefFor(file.path)} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60">
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{file.path}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
      </Link>
    </li>
  );

  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <p className="bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        파일 {files.length}개 · {formatBytes(total)}
      </p>
      <ul>{files.slice(0, SHOWN).map(row)}</ul>
      {files.length > SHOWN && (
        <details className="group">
          <summary className="cursor-pointer border-t px-3 py-2 text-xs text-primary hover:bg-muted/60 group-open:hidden">
            외 {files.length - SHOWN}개 더 보기
          </summary>
          <ul>{files.slice(SHOWN).map(row)}</ul>
        </details>
      )}
    </div>
  );
}
