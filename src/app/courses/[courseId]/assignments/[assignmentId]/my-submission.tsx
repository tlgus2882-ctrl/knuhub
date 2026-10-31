import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { LateBadge } from "./late-badge";
import { DeleteSubmissionForm } from "./delete-submission-form";
import { SubmissionFileList } from "./submission-files";
import { submissionFileHrefs } from "./submissions/submission-href";
import { GitHubSubmitForm } from "./github-submit-form";
import { SubmissionUploadForm } from "./submission-upload-form";

type Props = {
  courseId: string;
  assignmentId: string;
  studentId: string;
  open: boolean;
  dueAt: string;
  lateDueAt: string | null;
  /** The 마감 has passed (submitting may still be open as 지각 제출). */
  pastDue: boolean;
};

// The signed-in 수강생's own submission for one assignment.
export async function MySubmission({ courseId, assignmentId, studentId, open, dueAt, lateDueAt, pastDue }: Props) {
  const supabase = await createServerSupabase();
  const { data: submission } = await supabase
    .from("submission")
    .select("id, submitted_at, submission_file(path, size, storage_path)")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  const files = submission?.submission_file ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">내 제출물</h2>

      {submission ? (
        <>
          <p className="text-sm">
            <span className="font-medium">제출함</span>{" "}
            <span className="text-muted-foreground">· {formatKst(submission.submitted_at)}</span>{" "}
            <LateBadge submittedAt={submission.submitted_at} dueAt={dueAt} />
          </p>
          <SubmissionFileList
            files={files}
            hrefFor={submissionFileHrefs(courseId, assignmentId, submission.id)}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">아직 제출하지 않았어요.</p>
      )}

      {open ? (
        <>
          {pastDue && lateDueAt && (
            <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-900/30 dark:text-orange-100">
              마감이 지났어요. {formatKst(lateDueAt)}까지 지각 제출할 수 있고, 지금 내면 지각으로 표시돼요.
            </p>
          )}
          <SubmissionUploadForm assignmentId={assignmentId} studentId={studentId} resubmit={Boolean(submission)} />
          <GitHubSubmitForm assignmentId={assignmentId} resubmit={Boolean(submission)} />
          {submission && <DeleteSubmissionForm assignmentId={assignmentId} />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">마감이 지나서 제출하거나 고칠 수 없어요.</p>
      )}
    </section>
  );
}

