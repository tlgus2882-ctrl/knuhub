import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { Code } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { UserChip } from "@/components/user-link";
import { SubmissionFileList } from "./submission-files";
import { submissionFileHrefs, submissionHref } from "./submissions/submission-href";

type Props = {
  courseId: string;
  assignmentId: string;
  /** Left out of the list because "내 제출물" already shows it. */
  viewerId?: string;
};

// Every 제출물 of the assignment the viewer may see. Which ones that is
// (마감일, 공개 범위, role) is decided by RLS alone (docs/adr/0002).
export async function SubmissionList({ courseId, assignmentId, viewerId }: Props) {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("submission")
    .select("id, submitted_at, student_id, profile(name, student_number), submission_file(path, size, storage_path)")
    .eq("assignment_id", assignmentId);
  if (viewerId) query = query.neq("student_id", viewerId);
  const { data: submissions } = await query.order("submitted_at");

  const rows = submissions ?? [];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {viewerId ? "다른 사람의 제출물" : "제출물"} <span className="text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((submission) => (
            <li key={submission.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <UserChip
                  userId={submission.student_id}
                  name={submission.profile?.name ?? "알 수 없음"}
                  studentNumber={submission.profile?.student_number ?? null}
                />
                <span className="order-last basis-full text-sm text-muted-foreground sm:order-none sm:basis-auto">
                  {formatKst(submission.submitted_at)}
                </span>
                <Link
                  href={submissionHref(courseId, assignmentId, submission.id)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "ml-auto border-primary/40 text-primary hover:bg-primary/5 hover:text-primary",
                  )}
                >
                  <Code aria-hidden />
                  제출물 보기
                </Link>
              </div>
              <SubmissionFileList
                files={submission.submission_file}
                hrefFor={submissionFileHrefs(courseId, assignmentId, submission.id)}
              />
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
