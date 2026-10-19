"use server";

import { isSuspicious, reviewSubmission, type ReviewModel } from "@/lib/ai-review/review";
import { reviewModel } from "@/lib/ai-review/model";
import { readTextFiles } from "@/lib/submissions/read-text-files";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";

export type FirstCheckProgress = { error: string | null; total: number; remaining: number };

// Raised by request_first_check() / claim_first_check() (supabase/migrations/*_first_check.sql).
const KH010 = "1차 검사는 이 과목의 담당 교수나 조교가 마감 후에만 할 수 있어요.";
const STOPPED_ERRORS = {
  notConfigured: "AI 기능이 아직 설정되지 않았어요.",
  failed: "일부 제출물을 검사하지 못했어요. 잠시 뒤에 이어서 검사해 주세요.",
};

/** Submissions one call checks, one after another (free-tier rate limits, function time limits). */
const PER_CALL = 2;

/** 전체 검사: queues every 제출물 without an up-to-date result. */
export async function requestFirstCheck(assignmentId: string): Promise<FirstCheckProgress> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("request_first_check", { target_assignment: assignmentId });
  if (error) {
    console.error("request_first_check failed", error.message);
    return { error: error.code === "KH010" ? KH010 : STOPPED_ERRORS.failed, total: 0, remaining: 0 };
  }
  return progress(supabase, assignmentId, null);
}

/**
 * Checks the next few queued 제출물. The page calls this again and again until nothing remains:
 * there is no job server, so the work moves only while someone keeps the page open.
 */
export async function advanceFirstCheck(assignmentId: string): Promise<FirstCheckProgress> {
  const supabase = await createServerSupabase();
  const { data: claimed, error } = await supabase.rpc("claim_first_check", { target_assignment: assignmentId, max_count: PER_CALL });
  if (error) {
    console.error("claim_first_check failed", error.message);
    return { error: error.code === "KH010" ? KH010 : STOPPED_ERRORS.failed, total: 0, remaining: 0 };
  }

  const model = reviewModel();
  // Results and the queue are written with the secret key: staff could forge results otherwise.
  const admin = createAdminSupabase();
  for (const [index, { submission_id }] of claimed.entries()) {
    const stopped = model
      ? await checkOne(supabase, admin, submission_id, model).catch((cause) => {
          console.error("first check failed", submission_id, cause);
          return STOPPED_ERRORS.failed;
        })
      : STOPPED_ERRORS.notConfigured;
    if (stopped) {
      // Hand back what this call took but did not finish, so the next call takes it again.
      const unfinished = claimed.slice(index).map((row) => row.submission_id);
      await admin.from("first_check_queue").update({ claimed_at: null }).in("submission_id", unfinished);
      return progress(supabase, assignmentId, stopped);
    }
  }
  return progress(supabase, assignmentId, null);
}

/** Reviews one 제출물 and saves the result; returns why it stopped, or null once saved. */
async function checkOne(
  supabase: ServerSupabase,
  admin: ReturnType<typeof createAdminSupabase>,
  submissionId: string,
  model: ReviewModel,
): Promise<string | null> {
  // One query, so the files match the 제출 시각 and the 채점 항목 match their version.
  const { data: submission, error } = await supabase
    .from("submission")
    .select(
      "submitted_at, profile(name, student_number), assignment!inner(criteria_version, grading_criterion(name, points, description, position)), submission_file(path, storage_path, kind)",
    )
    .eq("id", submissionId)
    .single();
  if (error) throw error;

  const criteria = submission.assignment.grading_criterion
    .toSorted((a, b) => a.position - b.position)
    .map(({ name, points, description }) => ({ name, points, description }));
  const files = await readTextFiles(supabase, submission.submission_file);
  const redact = [submission.profile?.name, submission.profile?.student_number].filter((s): s is string => Boolean(s));
  const review = files.length ? await reviewSubmission(model, criteria, files, { redact }) : ({ kind: "too_large" } as const);
  if (review.kind === "failed") return STOPPED_ERRORS.failed;

  const { error: saveError } = await admin.from("first_check").upsert({
    submission_id: submissionId,
    submitted_at: submission.submitted_at,
    criteria_version: submission.assignment.criteria_version,
    criteria,
    // Too large or no text file: 검사할 수 없음, shown apart so staff look at it themselves.
    status: review.kind === "reviewed" ? "reviewed" : "unreviewable",
    opinions: review.kind === "reviewed" ? review.opinions : [],
    suspicious: review.kind === "reviewed" && isSuspicious(review.opinions),
    checked_at: new Date().toISOString(),
  });
  if (saveError) throw saveError;
  const { error: dequeueError } = await admin.from("first_check_queue").delete().eq("submission_id", submissionId);
  if (dequeueError) throw dequeueError;
  return null;
}

async function progress(supabase: ServerSupabase, assignmentId: string, error: string | null): Promise<FirstCheckProgress> {
  const { data } = await supabase.rpc("first_check_progress", { target_assignment: assignmentId });
  const row = data?.[0];
  return { error, total: row?.total ?? 0, remaining: row?.remaining ?? 0 };
}
