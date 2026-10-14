// Browser side of attaching 첨부파일: uploads straight to Storage (docs/adr/0002), then
// the server action attaches each file. Shared by the 과제 form and the 과제 화면.
import { ASSIGNMENT_FILE_BUCKET, ASSIGNMENT_FILE_MAX_BYTES, assignmentFileObjectName } from "@/lib/assignments/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { attachAssignmentFile } from "./[assignmentId]/attachment-actions";

const UPLOAD_FAILED = "올리지 못했어요. 이 과목의 담당 교수나 조교인지 확인해 주세요.";

/** Files over the per-file limit, checked before anything is uploaded. */
export function oversizedFiles(files: File[]): File[] {
  return files.filter((file) => file.size > ASSIGNMENT_FILE_MAX_BYTES);
}

export const ASSIGNMENT_FILE_LIMIT_LABEL = `${ASSIGNMENT_FILE_MAX_BYTES / 1024 / 1024}MB`;

export function oversizedMessage(files: File[]): string {
  return `첨부파일은 하나에 ${ASSIGNMENT_FILE_LIMIT_LABEL}까지예요: ${files.map((f) => f.name).join(", ")}`;
}

/**
 * Attaches the files one by one. Stops at the first failure and says which file
 * failed and how many were attached; null when all were attached.
 */
export async function attachFiles(assignmentId: string, files: File[]): Promise<string | null> {
  const storage = createBrowserSupabase().storage.from(ASSIGNMENT_FILE_BUCKET);

  for (const [done, file] of files.entries()) {
    const failure = await attachOne(file);
    if (failure) {
      const skipped = files.length - done - 1;
      const tally =
        files.length > 1 ? ` (${files.length}개 중 ${done}개 첨부${skipped ? `, ${skipped}개는 올리지 않음` : ""})` : "";
      return `${file.name}: ${failure}${tally}`;
    }
  }
  return null;

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
}
