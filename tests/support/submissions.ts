import { randomUUID } from "node:crypto";
import { SUBMISSION_BUCKET, submissionObjectName } from "../../src/lib/submissions/storage";
import type { TestUser } from "./supabase";

export { SUBMISSION_BUCKET };

export type UploadFile = { path: string; body: string; kind?: "text" | "binary" };

/** Uploads files the way the browser does: one fresh folder per attempt, objects named by index. */
export async function uploadAttempt(student: TestUser, assignmentId: string, files: UploadFile[]) {
  const attempt = randomUUID();
  const uploaded: { path: string; storage_path: string; kind: "text" | "binary" }[] = [];
  for (const [index, file] of files.entries()) {
    const storagePath = submissionObjectName(assignmentId, student.id, attempt, index);
    const { error } = await student.client.storage
      .from(SUBMISSION_BUCKET)
      .upload(storagePath, new Blob([file.body], { type: "text/plain" }));
    if (error) return { files: uploaded, error };
    uploaded.push({ path: file.path, storage_path: storagePath, kind: file.kind ?? "text" });
  }
  return { files: uploaded, error: null };
}

/** Uploads then submits; on success removes the replaced objects like the server action does. */
export async function submitFiles(student: TestUser, assignmentId: string, files: UploadFile[]) {
  const upload = await uploadAttempt(student, assignmentId, files);
  if (upload.error) return { error: upload.error, storagePaths: [] as string[] };

  const { data: replaced, error } = await student.client.rpc("submit_files", {
    target_assignment: assignmentId,
    files: upload.files,
  });
  if (error) return { error, storagePaths: upload.files.map((f) => f.storage_path) };

  if (replaced?.length) await student.client.storage.from(SUBMISSION_BUCKET).remove(replaced);
  return { error: null, storagePaths: upload.files.map((f) => f.storage_path) };
}

/** Reads an object as `user`; null when Storage refuses. */
export async function download(user: TestUser, storagePath: string): Promise<string | null> {
  const { data, error } = await user.client.storage.from(SUBMISSION_BUCKET).download(storagePath);
  if (error || !data) return null;
  return data.text();
}
