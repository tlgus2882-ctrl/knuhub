import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { UserLink } from "@/components/user-link";
import { formatKst } from "@/lib/time";
import { LateBadge } from "./late-badge";
import type { Criterion, Opinion } from "@/lib/ai-review/review";
import { sameTime } from "./ai-review-result";
import { StatusFilter } from "./status-filter";
import { submissionHref } from "./submissions/submission-href";

type Props = { courseId: string; assignmentId: string; dueAt: string };

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
export async function SubmissionStatus({ courseId, assignmentId, dueAt }: Props) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("submission_status", {
    target_assignment: assignmentId,
  });
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
      .select(
        "submission_id, submitted_at, criteria_version, status, suspicious, criteria, opinions, submission!inner(assignment_id)",
      )
      .eq("submission.assignment_id", assignmentId),
    supabase.from("assignment").select("criteria_version").eq("id", assignmentId).single(),
  ]);
  const checkOf = new Map(checks?.map((c) => [c.submission_id, c]));
  const firstCheckOf = (row: StatusRow): FirstCheckCell | null => {
    if (!row.submission_id || !row.submitted_at) return null;
    const check = checkOf.get(row.submission_id);
    if (!check) return { label: "notChecked" };
    // A result for an older 제출물 or older 채점 항목 needs a new check, but an old 의심 stays visible.
    if (!sameTime(check.submitted_at, row.submitted_at) || check.criteria_version !== assignment?.criteria_version) {
      return { label: "notChecked", wasSuspicious: check.suspicious };
    }
    if (check.status === "unreviewable") return { label: "unreviewable" };
    if (!check.suspicious) return { label: "clear" };
    // Why: the 채점 항목 judged 부족 or 판단 불가.
    const criteria = check.criteria as Criterion[];
    const reasons = (check.opinions as Opinion[]).filter((o) => o.verdict !== "met").map((o) => criteria[o.criterion - 1]?.name);
    return { label: "suspicious", reasons: reasons.filter(Boolean).join(", ") };
  };
  const suspiciousCount = rows.filter((row) => firstCheckOf(row)?.label === "suspicious").length;
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
        <StatusFilter suspiciousCount={suspiciousCount}>
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
                {rows.map((row) => {
                  const firstCheck = firstCheckOf(row);
                  return (
                    <tr
                      key={row.student_id}
                      className={firstCheck?.label === "suspicious" ? undefined : "group-data-[filter=suspicious]/status:hidden"}
                    >
                      <td className="px-4 py-2">
                        <UserLink userId={row.student_id} name={row.name} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{row.student_number ?? "학번 없음"}</td>
                      <td className="px-4 py-2">
                        {row.submission_id ? (
                          <Link
                            href={submissionHref(courseId, assignmentId, row.submission_id)}
                            className="text-primary underline"
                          >
                            제출함
                          </Link>
                        ) : (
                          <span className="text-destructive">미제출</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{row.submitted_at ? (
                          <>
                            {formatKst(row.submitted_at)} <LateBadge submittedAt={row.submitted_at} dueAt={dueAt} />
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <FirstCheckBadge cell={firstCheck} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </StatusFilter>
      ) : (
        <p className="text-sm text-muted-foreground">아직 수강생이 없어요.</p>
      )}
    </section>
  );
}

type FirstCheckLabel = "notChecked" | "unreviewable" | "suspicious" | "clear";

const FIRST_CHECK_BADGE: Record<FirstCheckLabel, { text: string; className: string }> = {
  notChecked: { text: "검사 전", className: "text-muted-foreground" },
  unreviewable: {
    text: "검사할 수 없음",
    className: "rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  },
  suspicious: {
    text: "의심",
    className: "rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
  clear: { text: "의심 없음", className: "text-muted-foreground" },
};

type FirstCheckCell = {
  label: FirstCheckLabel;
  reasons?: string;
  wasSuspicious?: boolean;
};

function FirstCheckBadge({ cell }: { cell: FirstCheckCell | null }) {
  if (!cell) return <span className="text-muted-foreground">-</span>;
  const badge = FIRST_CHECK_BADGE[cell.label];
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`text-xs ${badge.className}`}>{badge.text}</span>
      {cell.reasons && <span className="text-xs text-muted-foreground">{cell.reasons}</span>}
      {cell.wasSuspicious && <span className="text-xs text-muted-foreground">이전 결과: 의심</span>}
    </span>
  );
}
