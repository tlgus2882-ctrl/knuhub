import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { SubmissionFileList, signDownloadLinks } from "./submission-files";

// Every 제출물 of the assignment the viewer may see. Which ones that is
// (마감일, 공개 범위, role) is decided by RLS alone (docs/adr/0002).
export async function SubmissionList({ assignmentId }: { assignmentId: string }) {
  const supabase = await createServerSupabase();
  const { data: submissions } = await supabase
    .from("submission")
    .select("id, submitted_at, profile(name, student_number), submission_file(path, size, storage_path)")
    .eq("assignment_id", assignmentId)
    .order("submitted_at");

  const rows = submissions ?? [];
  const links = await signDownloadLinks(
    supabase,
    rows.flatMap((s) => s.submission_file),
  );

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        제출물 <span className="text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((submission) => (
            <li key={submission.id} className="flex flex-col gap-2 p-4">
              <p className="text-sm">
                <span className="font-medium">{submission.profile?.name}</span>{" "}
                <span className="text-muted-foreground">
                  {submission.profile?.student_number ?? "학번 없음"} · {formatKst(submission.submitted_at)}
                </span>
              </p>
              <SubmissionFileList files={submission.submission_file} links={links} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          볼 수 있는 제출물이 없어요. 다른 사람의 제출물은 마감 후 공개 범위에 따라 보여요.
        </p>
      )}
    </section>
  );
}
