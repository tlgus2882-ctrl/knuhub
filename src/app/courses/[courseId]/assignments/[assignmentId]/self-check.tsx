import type { Criterion, Opinion, Verdict } from "@/lib/ai-review/review";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SelfCheckButton } from "./self-check-button";
import { submissionHref } from "./submissions/submission-href";

type Props = { courseId: string; assignmentId: string; studentId: string; open: boolean };

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  met: { label: "충족", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  not_met: { label: "부족", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  uncertain: { label: "판단 불가", className: "bg-muted text-muted-foreground" },
};

const sameTime = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

// The signed-in 수강생's 셀프 점검 for one assignment: the button and their own results (RLS shows no one else).
export async function SelfCheck({ courseId, assignmentId, studentId, open }: Props) {
  const supabase = await createServerSupabase();
  const [{ data: assignment }, { data: submission }, { data: usage }, { data: limit }] = await Promise.all([
    supabase.from("assignment").select("criteria_version").eq("id", assignmentId).single(),
    supabase
      .from("submission")
      .select("id, submitted_at, submission_history(id, submitted_at), self_check(id, submitted_at, criteria_version, criteria, opinions, created_at)")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .order("created_at", { referencedTable: "self_check", ascending: false })
      .maybeSingle(),
    supabase.from("self_check_usage").select("used").eq("assignment_id", assignmentId).maybeSingle(),
    supabase.rpc("self_check_limit"),
  ]);
  const criteriaVersion = assignment?.criteria_version ?? 0;
  const max = limit ?? 0;

  // Evidence opens the code viewer at its line, in the 제출물 version the result checked.
  const evidenceHref = (checkedAt: string) => {
    if (!submission) return null;
    if (sameTime(checkedAt, submission.submitted_at)) {
      return (path: string, line: number) => `${submissionHref(courseId, assignmentId, submission.id, path)}#L${line}`;
    }
    const history = submission.submission_history.find((h) => sameTime(h.submitted_at, checkedAt));
    return history
      ? (path: string, line: number) => `${submissionHref(courseId, assignmentId, submission.id, path, history.id)}#L${line}`
      : null;
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">셀프 점검</h2>
        <p className="text-sm text-muted-foreground">
          마감 전에 내 제출물을 채점 항목별로 AI에게 점검받아요. 결과는 나만 봐요. AI 검토 의견은 점수가 아니라
          참고 의견이고, 최종 평가는 교수님이 해요.
        </p>
      </div>

      {criteriaVersion === 0 ? (
        <p className="text-sm text-muted-foreground">아직 열리지 않았어요. 교수님이 채점 항목을 정하면 쓸 수 있어요.</p>
      ) : !open ? (
        <p className="text-sm text-muted-foreground">마감이 지나서 셀프 점검을 쓸 수 없어요.</p>
      ) : !submission ? (
        <p className="text-sm text-muted-foreground">제출하면 셀프 점검을 쓸 수 있어요.</p>
      ) : (
        <SelfCheckButton assignmentId={assignmentId} remaining={max - (usage?.used ?? 0)} limit={max} />
      )}

      {submission?.self_check.map((result) => {
        const criteria = result.criteria as Criterion[];
        const hrefFor = evidenceHref(result.submitted_at);
        return (
          <article key={result.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{formatKst(result.created_at)} 점검</span>
              {!sameTime(result.submitted_at, submission.submitted_at) && <Tag>이전 제출물</Tag>}
              {result.criteria_version !== criteriaVersion && <Tag>이전 채점 항목 기준</Tag>}
            </div>
            <ol className="flex flex-col gap-3">
              {(result.opinions as Opinion[]).map((opinion) => {
                const criterion = criteria[opinion.criterion - 1];
                const verdict = VERDICT[opinion.verdict];
                return (
                  <li key={opinion.criterion} className="flex flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", verdict.className)}>{verdict.label}</span>
                      <span className="font-medium">
                        {criterion?.name} <span className="text-muted-foreground">({criterion?.points}점)</span>
                      </span>
                    </div>
                    {opinion.comment && <p className="text-muted-foreground">{opinion.comment}</p>}
                    {opinion.evidence.length > 0 && (
                      <ul className="flex flex-wrap gap-x-3 gap-y-1">
                        {opinion.evidence.map((e) => {
                          const label = `${e.path} ${e.start_line === e.end_line ? e.start_line : `${e.start_line}–${e.end_line}`}줄`;
                          return (
                            <li key={`${e.path}:${e.start_line}-${e.end_line}`} className="font-mono text-xs">
                              {hrefFor ? (
                                // A full page load, so the browser marks the line as :target and scrolls to it.
                                <a href={hrefFor(e.path, e.start_line)} className="text-primary underline">
                                  {label}
                                </a>
                              ) : (
                                label
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}
