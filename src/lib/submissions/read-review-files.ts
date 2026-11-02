import "server-only";
import type { ReviewFile } from "@/lib/ai-review/review";
import { decodeText } from "@/lib/highlight";
import type { ServerSupabase } from "@/lib/supabase/server";
import { isNotebook, notebookReviewText, parseNotebook } from "./notebook";
import { hasPdfHeader, isPdf } from "./pdf";
import { SUBMISSION_BUCKET } from "./storage";
import type { FileKind } from "./prepare-upload";

/** Output graphs attached as pictures per 제출물 (in file and cell order), to keep the cost bounded. */
export const MAX_REVIEW_IMAGES = 10;

/**
 * A 제출물's files for AI 검토, read as `supabase` (so Storage policies apply): its text files and its
 * PDFs; other binary files are skipped. A notebook goes in as its cells' text, with its first output
 * graphs as pictures (see notebookReviewText). A PDF goes in whole, to be attached as a document.
 */
export async function readReviewFiles(
  supabase: ServerSupabase,
  files: { path: string; storage_path: string; kind: FileKind }[],
): Promise<ReviewFile[]> {
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const read = await Promise.all(
    files
      .filter((f) => f.kind === "text" || isPdf(f.path))
      .map(async (f) => {
        const { data, error } = await storage.download(f.storage_path);
        if (error) throw error;
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (f.kind === "text") return { path: f.path, text: decodeText(bytes.buffer) };
        // Named .pdf but not a PDF: skipped like any other binary file.
        return hasPdfHeader(bytes) ? { path: f.path, text: "", pdf: Buffer.from(bytes).toString("base64") } : null;
      }),
  );
  // In file order, so the picture budget goes to the first graphs.
  let imagesLeft = MAX_REVIEW_IMAGES;
  return read
    .filter((f) => f !== null)
    .map((file) => {
      const notebook = !file.pdf && isNotebook(file.path) ? parseNotebook(file.text) : null;
      if (!notebook) return file;
      const converted = notebookReviewText(notebook, imagesLeft);
      imagesLeft -= converted.images.length;
      return { path: file.path, ...converted };
    });
}
