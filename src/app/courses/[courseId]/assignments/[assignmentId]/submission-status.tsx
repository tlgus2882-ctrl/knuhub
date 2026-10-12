import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { submissionHref } from "./submissions/submission-href";

type Props = { courseId: string; assignmentId: string };

/** One 수강생's row. The generated types miss that a missing submission comes back as null. */
type StatusRow = {
  student_id: string;
  name: string;
  student_number: string | null;
  submission_id: string | null;
  submitted_at: string | null;
};

// 제출 현황 표: every 수강생, submitted or not. submission_status() lets only the
// course's professor and assistants read it (docs/adr/0002).
export async function SubmissionStatus({ courseId, assignmentId }: Props) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("submission_status", { target_assignment: assignmentId });
  if (error) return null;

  const rows = data as StatusRow[];
  const submitted = rows.filter((r) => r.submitted_at).length;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        제출 현황{" "}
        <span className="text-muted-foreground">
          {submitted}/{rows.length}명
        </span>
      </h2>
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">학번</th>
                <th className="px-4 py-2 font-medium">제출</th>
                <th className="px-4 py-2 font-medium">제출 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.student_id}>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.student_number ?? "-"}</td>
                  <td className="px-4 py-2">
                    {row.submission_id ? (
                      <Link href={submissionHref(courseId, assignmentId, row.submission_id)} className="underline">
                        제출함
                      </Link>
                    ) : (
                      <span className="text-destructive">미제출</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.submitted_at ? formatKst(row.submitted_at) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 수강생이 없어요.</p>
      )}
    </section>
  );
}
