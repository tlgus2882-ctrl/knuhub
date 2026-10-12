import { randomUUID } from "node:crypto";
import { ASSIGNMENT_FILE_BUCKET, assignmentFileObjectName } from "../../src/lib/assignments/storage";
import type { TestUser } from "./supabase";

export { ASSIGNMENT_FILE_BUCKET };

/** Uploads a file to the assignment's folder and attaches it, like the 과제 화면 does. */
export async function attachFile(user: TestUser, assignmentId: string, name: string, body: string) {
  const storagePath = assignmentFileObjectName(assignmentId, randomUUID());
  const upload = await user.client.storage.from(ASSIGNMENT_FILE_BUCKET).upload(storagePath, new Blob([body]));
  if (upload.error) return { error: upload.error, storagePath, fileId: null };

  const { data: fileId, error } = await user.client.rpc("attach_assignment_file", {
    target_assignment: assignmentId,
    storage_path: storagePath,
    name,
  });
  return { error, storagePath, fileId };
}

/** Reads an attachment as `user`; null when Storage refuses. */
export async function downloadAttachment(user: TestUser, storagePath: string): Promise<string | null> {
  const { data, error } = await user.client.storage.from(ASSIGNMENT_FILE_BUCKET).download(storagePath);
  if (error || !data) return null;
  return data.text();
}
