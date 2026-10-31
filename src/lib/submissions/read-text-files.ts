import "server-only";
import type { ReviewFile } from "@/lib/ai-review/review";
import { decodeText } from "@/lib/highlight";
import type { ServerSupabase } from "@/lib/supabase/server";
import { isNotebook, notebookReviewText, parseNotebook } from "./notebook";
import { SUBMISSION_BUCKET } from "./storage";
import type { FileKind } from "./prepare-upload";

/** Output graphs attached as pictures per 제출물 (in file and cell order), to keep the cost bounded. */
export const MAX_REVIEW_IMAGES = 10;

/**
 * A 제출물's text files, read as `supabase` (so Storage policies apply); binary files are skipped.
 * A notebook goes in as its cells' text, with its first output graphs as pictures (see notebookReviewText).
 */
export async function readTextFiles(
  supabase: ServerSupabase,
  files: { path: string; storage_path: string; kind: FileKind }[],
): Promise<ReviewFile[]> {
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const texts = await Promise.all(
    files
      .filter((f) => f.kind === "text")
      .map(async (f) => {
        const { data, error } = await storage.download(f.storage_path);
        if (error) throw error;
        return { path: f.path, text: decodeText(await data.arrayBuffer()) };
      }),
  );
  // In file order, so the picture budget goes to the first graphs.
  let imagesLeft = MAX_REVIEW_IMAGES;
  return texts.map(({ path, text }) => {
    const notebook = isNotebook(path) ? parseNotebook(text) : null;
    if (!notebook) return { path, text };
    const converted = notebookReviewText(notebook, imagesLeft);
    imagesLeft -= converted.images.length;
    return { path, ...converted };
  });
}
