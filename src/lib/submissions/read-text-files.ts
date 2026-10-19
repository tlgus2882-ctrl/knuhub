import "server-only";
import type { ReviewFile } from "@/lib/ai-review/review";
import { decodeText } from "@/lib/highlight";
import type { ServerSupabase } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET } from "./storage";
import type { FileKind } from "./prepare-upload";

/** A 제출물's text files, read as `supabase` (so Storage policies apply); binary files are skipped. */
export async function readTextFiles(
  supabase: ServerSupabase,
  files: { path: string; storage_path: string; kind: FileKind }[],
): Promise<ReviewFile[]> {
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  return Promise.all(
    files
      .filter((f) => f.kind === "text")
      .map(async (f) => {
        const { data, error } = await storage.download(f.storage_path);
        if (error) throw error;
        return { path: f.path, text: decodeText(await data.arrayBuffer()) };
      }),
  );
}
