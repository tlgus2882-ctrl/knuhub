import Link from "next/link";
import { formatBytes } from "@/lib/format-bytes";
import type { Tables } from "@/lib/supabase/database.types";

export type SubmissionFile = Pick<Tables<"submission_file">, "path" | "size" | "storage_path">;

/** The 제출물's files, each opening the code viewer at that file. */
export function SubmissionFileList({ files, hrefFor }: { files: SubmissionFile[]; hrefFor: (path: string) => string }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {files.map((file) => (
        <li key={file.storage_path}>
          <Link href={hrefFor(file.path)} className="underline">
            {file.path}
          </Link>{" "}
          <span className="text-muted-foreground">({formatBytes(file.size)})</span>
        </li>
      ))}
    </ul>
  );
}
