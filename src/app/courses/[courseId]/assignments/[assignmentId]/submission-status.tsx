import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { UserLink } from "@/components/user-link";
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
  if (error) {
    // 42501: not this course's professor or assistant (the page hides the section then anyway).
    if (error.code !== "42501") console.error("submission_status failed", error.message);
    return null;
  }

  const rows = data as StatusRow[];
  // 1차 검사 results, readable by the same professor and assistants (RLS).
  const [{ data: checks }, { data: assignment }] = await Promise.all([
    supabase
      .from("first_check")
      .select("submission_id, submitted_at, criteria_version, status, suspicious, submission!inner(assignment_id)")
      .eq("submission.assignment_id", assignmentId),
    supabase.from("assignment").select("criteria_version").eq("id", assignmentId).single(),
  ]);
  const checkOf = new Map(checks?.map((c) => [c.submission_id, c]));
  const firstCheckLabel = (row: StatusRow): FirstCheckLabel | null => {
    if (!row.submission_id || !row.submitted_at) return null;
    const check = checkOf.get(row.submission_id);
    const upToDate =
      check &&
      new Date(check.submitted_at).getTime() === new Date(row.submitted_at).getTime() &&
      check.criteria_version === assignment?.criteria_version;
    if (!upToDate) return "notChecked";
    if (check.status === "unreviewable") return "unreviewable";
    return check.suspicious ? "suspicious" : "clear";
  };
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
                <th className="px-4 py-2 font-medium">1차 검사</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.student_id}>
                  <td className="px-4 py-2">
                    <UserLink userId={row.student_id} name={row.name} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{row.student_number ?? "학번 없음"}</td>
                  <td className="px-4 py-2">
                    {row.submission_id ? (
                      <Link href={submissionHref(courseId, assignmentId, row.submission_id)} className="text-primary underline">
                        제출함
                      </Link>
                    ) : (
                      <span className="text-destructive">미제출</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.submitted_at ? formatKst(row.submitted_at) : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <FirstCheckBadge label={firstCheckLabel(row)} />
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

type FirstCheckLabel = "notChecked" | "unreviewable" | "suspicious" | "clear";

const FIRST_CHECK_BADGE: Record<FirstCheckLabel, { text: string; className: string }> = {
  notChecked: { text: "검사 전", className: "text-muted-foreground" },
  unreviewable: { text: "검사할 수 없음", className: "rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  suspicious: { text: "의심", className: "rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  clear: { text: "의심 없음", className: "text-muted-foreground" },
};

function FirstCheckBadge({ label }: { label: FirstCheckLabel | null }) {
  if (!label) return <span className="text-muted-foreground">-</span>;
  const badge = FIRST_CHECK_BADGE[label];
  return <span className={`text-xs ${badge.className}`}>{badge.text}</span>;
}
