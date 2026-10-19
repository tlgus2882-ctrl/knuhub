"use server";

import { refresh } from "next/cache";
import { claudeReviewModel } from "@/lib/ai-review/claude";
import { geminiReviewModel } from "@/lib/ai-review/gemini";
import { reviewSubmission } from "@/lib/ai-review/review";
import { decodeText } from "@/lib/highlight";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";

// Raised by start_self_check() (supabase/migrations/*_self_check.sql).
const START_ERRORS: Record<string, string> = {
  KH008: "지금은 셀프 점검을 쓸 수 없어요. 마감 전이고, 채점 항목이 정해져 있고, 제출물이 있어야 해요.",
  KH009: "이 과제의 셀프 점검 횟수를 다 썼어요.",
};
const NOT_CHARGED = {
  notConfigured: "AI 기능이 아직 설정되지 않았어요. 횟수는 차감되지 않았어요.",
  noText: "점검할 텍스트 파일이 없어요. 코드 파일을 제출해 주세요. 횟수는 차감되지 않았어요.",
  tooLarge: "제출물이 너무 커서 점검할 수 없어요. 횟수는 차감되지 않았어요.",
  failed: "점검하지 못했어요. 횟수는 차감되지 않았으니 잠시 뒤에 다시 해 주세요.",
};

/**
 * 셀프 점검: charges one use (start_self_check decides who may and when), reviews the
 * signed-in student's current 제출물 and saves the result for them alone. Nothing saved, no charge.
 */
export async function runSelfCheck(assignmentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("start_self_check", { target_assignment: assignmentId });
  if (error || !user) return { error: START_ERRORS[error?.code ?? "KH008"] ?? NOT_CHARGED.failed };

  const notSaved = await reviewAndSave(supabase, assignmentId, user.id).catch((cause) => {
    console.error("runSelfCheck failed", cause);
    return NOT_CHARGED.failed;
  });
  if (notSaved) {
    // Students could refund themselves past the limit, so only the server may (refund_self_check).
    await createAdminSupabase().rpc("refund_self_check", { target_assignment: assignmentId, target_student: user.id });
    return { error: notSaved };
  }
  refresh();
  return { error: null };
}

/** Returns why nothing was saved, or null once the result is saved. */
async function reviewAndSave(supabase: ServerSupabase, assignmentId: string, studentId: string): Promise<string | null> {
  // One query each, so the 채점 항목 match their version and the files match their 제출 시각.
  const [{ data: assignment }, { data: submission }, { data: author }] = await Promise.all([
    supabase
      .from("assignment")
      .select("criteria_version, grading_criterion(name, points, description, position)")
      .eq("id", assignmentId)
      .order("position", { referencedTable: "grading_criterion" })
      .single(),
    supabase
      .from("submission")
      .select("id, submitted_at, submission_file(path, storage_path, kind)")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .single(),
    supabase.from("profile").select("name, student_number").eq("id", studentId).single(),
  ]);
  if (!assignment || !submission) return NOT_CHARGED.failed;

  const model = geminiReviewModel() ?? claudeReviewModel();
  if (!model) return NOT_CHARGED.notConfigured;

  // Binary files never reach the model.
  const textFiles = submission.submission_file.filter((f) => f.kind === "text");
  if (!textFiles.length) return NOT_CHARGED.noText;
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const files = await Promise.all(
    textFiles.map(async (f) => {
      const { data, error } = await storage.download(f.storage_path);
      if (error) throw error;
      return { path: f.path, text: decodeText(await data.arrayBuffer()) };
    }),
  );

  const criteria = assignment.grading_criterion.map(({ name, points, description }) => ({ name, points, description }));
  const redact = [author?.name, author?.student_number].filter((s): s is string => Boolean(s));
  const review = await reviewSubmission(model, criteria, files, { redact });
  if (review.kind === "too_large") return NOT_CHARGED.tooLarge;
  if (review.kind === "failed") return NOT_CHARGED.failed;

  const { error } = await supabase.from("self_check").insert({
    submission_id: submission.id,
    submitted_at: submission.submitted_at,
    criteria_version: assignment.criteria_version,
    criteria,
    opinions: review.opinions,
  });
  if (error) throw error;
  return null;
}
