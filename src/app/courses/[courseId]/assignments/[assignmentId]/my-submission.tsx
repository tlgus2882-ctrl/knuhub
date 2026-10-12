import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { DeleteSubmissionForm } from "./delete-submission-form";
import { SubmissionFileList } from "./submission-files";
import { submissionFileHrefs } from "./submissions/submission-href";
import { SubmissionUploadForm } from "./submission-upload-form";

type Props = { courseId: string; assignmentId: string; studentId: string; open: boolean };

// The signed-in 수강생's own submission for one assignment.
export async function MySubmission({ courseId, assignmentId, studentId, open }: Props) {
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
            <span className="text-muted-foreground">· {formatKst(submission.submitted_at)}</span>
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
          <SubmissionUploadForm assignmentId={assignmentId} studentId={studentId} resubmit={Boolean(submission)} />
          {submission && <DeleteSubmissionForm assignmentId={assignmentId} />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">마감이 지나서 제출하거나 고칠 수 없어요.</p>
      )}
    </section>
  );
}

