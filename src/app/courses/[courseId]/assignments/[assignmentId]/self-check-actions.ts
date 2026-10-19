"use server";

import { refresh } from "next/cache";
import { reviewModel } from "@/lib/ai-review/model";
import { reviewSubmission } from "@/lib/ai-review/review";
import { readTextFiles } from "@/lib/submissions/read-text-files";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";

// Raised by start_self_check() (supabase/migrations/*_self_check.sql).
const START_ERRORS: Record<string, string> = {
  KH008: "지금은 셀프 점검을 쓸 수 없어요. 마감 전이고, 채점 항목이 정해져 있고, 제출물이 있어야 해요.",
  KH009: "이 과제의 셀프 점검 횟수를 다 썼어요.",
};
const NOT_SAVED_ERRORS = {
  notConfigured: "AI 기능이 아직 설정되지 않았어요. 횟수는 차감되지 않았어요.",
  noText: "점검할 텍스트 파일이 없어요. 코드 파일을 제출해 주세요. 횟수는 차감되지 않았어요.",
  tooLarge: "제출물이 너무 커서 점검할 수 없어요. 횟수는 차감되지 않았어요.",
  failed: "점검하지 못했어요. 횟수는 차감되지 않았으니 잠시 뒤에 다시 해 주세요.",
};
const UNKNOWN_ERROR = "점검하지 못했어요. 잠시 뒤에 다시 해 주세요.";

/**
 * 셀프 점검: charges one use (start_self_check decides who may and when), reviews the
 * signed-in student's current 제출물 and saves the result for them alone. Nothing saved, no charge.
 * Results and refunds go through the secret key: students could forge results or refund
 * themselves past the limit if they could write them (supabase/migrations/*_self_check.sql).
 */
export async function runSelfCheck(assignmentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: START_ERRORS.KH008 };
  const { error } = await supabase.rpc("start_self_check", { target_assignment: assignmentId });
  if (error) {
    console.error("start_self_check failed", error.message);
    return { error: START_ERRORS[error.code] ?? UNKNOWN_ERROR };
  }

  const whyNotSaved = await reviewAndSave(supabase, assignmentId, user.id).catch((cause) => {
    console.error("runSelfCheck failed", cause);
    return NOT_SAVED_ERRORS.failed;
  });
  if (whyNotSaved) {
    const refund = await createAdminSupabase().rpc("refund_self_check", { target_assignment: assignmentId, target_student: user.id });
    if (refund.error) {
      console.error("refund_self_check failed", refund.error.message);
      return { error: UNKNOWN_ERROR };
    }
    return { error: whyNotSaved };
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
  if (!assignment || !submission) return NOT_SAVED_ERRORS.failed;

  const model = reviewModel();
  if (!model) return NOT_SAVED_ERRORS.notConfigured;

  // Binary files never reach the model.
  const files = await readTextFiles(supabase, submission.submission_file);
  if (!files.length) return NOT_SAVED_ERRORS.noText;

  const criteria = assignment.grading_criterion.map(({ name, points, description }) => ({ name, points, description }));
  const redact = [author?.name, author?.student_number].filter((s): s is string => Boolean(s));
  const review = await reviewSubmission(model, criteria, files, { redact });
  if (review.kind === "too_large") return NOT_SAVED_ERRORS.tooLarge;
  if (review.kind === "failed") return NOT_SAVED_ERRORS.failed;

  // The 제출물 was read under the student's RLS above, so it is theirs.
  const { error } = await createAdminSupabase().from("self_check").insert({
    submission_id: submission.id,
    submitted_at: submission.submitted_at,
    criteria_version: assignment.criteria_version,
    criteria,
    opinions: review.opinions,
  });
  if (error) throw error;
  return null;
}
