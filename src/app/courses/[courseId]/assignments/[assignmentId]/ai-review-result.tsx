import type { Criterion, Opinion, Verdict } from "@/lib/ai-review/review";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { submissionHref } from "./submissions/submission-href";

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  met: { label: "충족", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  not_met: { label: "부족", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  uncertain: { label: "판단 불가", className: "bg-muted text-muted-foreground" },
};

export const sameTime = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/** A 제출물 now, with its 제출 이력, to tell which version an AI 검토 result checked. */
export type SubmissionVersions = { id: string; submitted_at: string; submission_history: { id: string; submitted_at: string }[] };

type Props = {
  courseId: string;
  assignmentId: string;
  submission: SubmissionVersions;
  criteriaVersion: number;
  /** A 셀프 점검 or 1차 검사 result. */
  result: { submitted_at: string; criteria_version: number; criteria: Json; opinions: Json };
  title: React.ReactNode;
};

// One AI 검토 result: its 채점 항목's verdicts, comments and evidence lines, marked
// "이전 제출물" / "이전 채점 항목 기준" when the 제출물 or the 채점 항목 changed since.
export function AiReviewResult({ courseId, assignmentId, submission, criteriaVersion, result, title }: Props) {
  const criteria = result.criteria as Criterion[];
  const current = sameTime(result.submitted_at, submission.submitted_at);
  // Evidence opens the code viewer at its line in the version checked (no link once it left the 제출 이력).
  const history = current ? undefined : submission.submission_history.find((h) => sameTime(h.submitted_at, result.submitted_at));
  const hrefFor =
    current || history
      ? (path: string, line: number) => `${submissionHref(courseId, assignmentId, submission.id, path, history?.id)}#L${line}`
      : null;

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {!current && <Tag>이전 제출물</Tag>}
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
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}
