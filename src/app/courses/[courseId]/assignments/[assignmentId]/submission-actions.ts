"use server";

import { refresh } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { downloadGitHubArchive, entriesFromGitHubArchive, parseGitHubRepo, type GitHubArchive } from "@/lib/submissions/github";
import { prepareUpload, SUBMISSION_MAX_FILES, UploadTooLargeError, type PreparedUpload } from "@/lib/submissions/prepare-upload";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import { discardUploaded, uploadPrepared, type UploadedFile } from "@/lib/submissions/upload";

export type SubmissionActionState = { error: string | null };

// Raised by submit_files() / delete_submission() (supabase/migrations/*_submission.sql).
const SUBMISSION_ERRORS: Record<string, string> = {
  KH003: "지금은 제출하거나 지울 수 없어요. 이 과목의 수강생인지, 마감이 지나지 않았는지 확인해 주세요.",
  KH004: "올린 파일을 찾지 못했어요. 다시 골라서 제출해 주세요.",
  KH005: "제출물은 20MB를 넘을 수 없어요.",
};
const UNKNOWN_ERROR = "처리하지 못했어요. 잠시 뒤에 다시 해 주세요.";

// Who may submit and until when is decided by submit_files() and the Storage
// policies (docs/adr/0002); this only finishes what the browser uploaded.
export async function submitUploadedFiles(
  assignmentId: string,
  files: UploadedFile[],
): Promise<SubmissionActionState> {
  const supabase = await createServerSupabase();
  const { data: replaced, error } = await supabase.rpc("submit_files", {
    target_assignment: assignmentId,
    files,
  });

  if (error) return failed("submitUploadedFiles", error);

  await removeObjects("submitUploadedFiles", replaced);
  refresh();
  return { error: null };
}

const TOO_LARGE = "node_modules, .git 같은 폴더를 빼고도 20MB가 넘어서 제출할 수 없어요.";
const GITHUB_ERRORS: Record<Exclude<GitHubArchive, { ok: true }>["reason"], string> = {
  "repo-not-found": "저장소를 찾지 못했어요. 주소가 맞는지, 공개 저장소인지 확인해 주세요. 비공개 저장소는 가져올 수 없어요.",
  "branch-not-found": "그 브랜치가 저장소에 없어요. 브랜치 이름을 확인해 주세요. 비워 두면 기본 브랜치를 가져와요.",
  "too-large": TOO_LARGE,
  unavailable: "GitHub에서 가져오지 못했어요. 잠시 뒤에 다시 해 주세요.",
};
const PREPARE_ERRORS: Record<Exclude<PreparedUpload, { ok: true }>["reason"], string> = {
  "too-large": TOO_LARGE,
  empty: "저장소에 제출할 파일이 없어요. (제외되는 폴더만 들어 있어요)",
  "too-many-files": `파일이 ${SUBMISSION_MAX_FILES}개를 넘어서 제출할 수 없어요. 빌드 결과물 같은 폴더를 빼 주세요.`,
  "duplicate-paths": "경로가 같은 파일이 여러 개 있어요. 저장소 구조를 확인해 주세요.",
};

/**
 * GitHub 공개 저장소로 제출: the server downloads the branch and runs it through the same
 * 업로드 준비 as a zip, uploads it to Storage as the student and submits it with submit_files().
 */
export async function submitFromGitHub(_prev: SubmissionActionState, form: FormData): Promise<SubmissionActionState> {
  const repo = parseGitHubRepo(String(form.get("repo") ?? ""), String(form.get("branch") ?? ""));
  if (!repo) return { error: "GitHub 저장소 주소가 아니에요. 예: https://github.com/아이디/저장소" };

  // Check before downloading, so only someone who may submit now makes the server fetch an archive.
  const assignmentId = String(form.get("assignment_id"));
  const supabase = await createServerSupabase();
  const [{ data: canSubmit }, { data: auth }] = await Promise.all([
    supabase.rpc("can_submit", { target_assignment: assignmentId }),
    supabase.auth.getUser(),
  ]);
  if (!canSubmit || !auth.user) return { error: SUBMISSION_ERRORS.KH003 };

  const archive = await downloadGitHubArchive(repo);
  if (!archive.ok) return { error: GITHUB_ERRORS[archive.reason] };

  let prepared: PreparedUpload;
  try {
    prepared = prepareUpload(entriesFromGitHubArchive(archive.zip));
  } catch (e) {
    return { error: e instanceof UploadTooLargeError ? TOO_LARGE : "GitHub에서 받은 압축 파일을 풀지 못했어요." };
  }
  if (!prepared.ok) return { error: PREPARE_ERRORS[prepared.reason] };

  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const uploaded = await uploadPrepared(storage, { assignmentId, studentId: auth.user.id }, prepared.files, () => {});
  if (!uploaded) return { error: "파일을 올리지 못했어요. 이 과목의 수강생인지, 마감이 지나지 않았는지 확인해 주세요." };

  const result = await submitUploadedFiles(assignmentId, uploaded);
  if (result.error) await discardUploaded(storage, uploaded);
  return result;
}

export async function deleteSubmission(
  _prev: SubmissionActionState,
  form: FormData,
): Promise<SubmissionActionState> {
  const assignmentId = String(form.get("assignment_id"));
  const supabase = await createServerSupabase();
  const { data: removed, error } = await supabase.rpc("delete_submission", { target_assignment: assignmentId });

  if (error) return failed("deleteSubmission", error);

  await removeObjects("deleteSubmission", removed);
  refresh();
  return { error: null };
}

function failed(action: string, error: { code: string; message: string }): SubmissionActionState {
  console.error(`${action} failed`, error.message);
  return { error: SUBMISSION_ERRORS[error.code] ?? UNKNOWN_ERROR };
}

// Files no longer in a submission. If this fails they stay in Storage, but
// nobody else can read them: reads go through the submission's file list.
async function removeObjects(action: string, storagePaths: string[] | null) {
  if (!storagePaths?.length) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.storage.from(SUBMISSION_BUCKET).remove(storagePaths);
  if (error) console.error(`${action}: removing old files failed`, error.message);
}
