import { formatBytes } from "@/lib/format-bytes";
import type { Tables } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";

export type SubmissionFile = Pick<Tables<"submission_file">, "path" | "size" | "storage_path">;

const DOWNLOAD_LINK_SECONDS = 60 * 5;

/**
 * Signed download links, keyed by storage_path, in one request. Storage signs
 * only the files the viewer may read (the submission viewing rules).
 */
export async function signDownloadLinks(
  supabase: ServerSupabase,
  files: SubmissionFile[],
): Promise<Map<string, string>> {
  if (!files.length) return new Map();
  const { data: signed } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrls(
    files.map((f) => f.storage_path),
    DOWNLOAD_LINK_SECONDS,
  );
  const links = new Map<string, string>();
  files.forEach((f, i) => {
    const url = signed?.[i]?.signedUrl;
    // Download under the submitted file name (the object name is just an index).
    // supabase-js's `download` option encodes the name twice, so Korean names come out garbled.
    if (url) links.set(f.storage_path, `${url}&download=${encodeURIComponent(f.path.split("/").pop() ?? f.path)}`);
  });
  return links;
}

export function SubmissionFileList({ files, links }: { files: SubmissionFile[]; links: Map<string, string> }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {files.map((file) => {
        const link = links.get(file.storage_path);
        return (
          <li key={file.storage_path}>
            {link ? (
              <a href={link} className="underline">
                {file.path}
              </a>
            ) : (
              file.path
            )}{" "}
            <span className="text-muted-foreground">({formatBytes(file.size)})</span>
          </li>
        );
      })}
    </ul>
  );
}

