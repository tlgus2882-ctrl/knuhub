import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { AiReviewResult, Tag, type SubmissionVersions } from "../../ai-review-result";

type Props = {
  courseId: string;
  assignmentId: string;
  submission: SubmissionVersions;
};

// The 1차 검사 result of one 제출물. RLS returns it only to the course's professor and
// assistants, so for everyone else this renders nothing.
export async function FirstCheckOpinions({ courseId, assignmentId, submission }: Props) {
  const supabase = await createServerSupabase();
  const [{ data: check }, { data: assignment }] = await Promise.all([
    supabase.from("first_check").select("submitted_at, criteria_version, criteria, status, opinions, suspicious, checked_at").eq("submission_id", submission.id).maybeSingle(),
    supabase.from("assignment").select("criteria_version").eq("id", assignmentId).single(),
  ]);
  if (!check) return null;

  return (
    <section aria-label="1차 검사" className="flex flex-col gap-2 xl:sticky xl:top-20 xl:w-80 xl:shrink-0">
      <p className="text-xs text-muted-foreground">AI 검토 의견은 참고 의견이에요. 학생에게는 보이지 않아요.</p>
      {check.status === "unreviewable" ? (
        <p className="rounded-lg border p-4 text-sm">
          <span className="font-medium">1차 검사 · 검사할 수 없음</span>
          <span className="block text-muted-foreground">제출물이 너무 크거나 텍스트 파일이 없어서 AI가 검사하지 못했어요. 직접 확인해 주세요.</span>
        </p>
      ) : (
        <AiReviewResult
          courseId={courseId}
          assignmentId={assignmentId}
          submission={submission}
          criteriaVersion={assignment?.criteria_version ?? 0}
          result={check}
          title={
            <>
              1차 검사 · {formatKst(check.checked_at)} {check.suspicious && <Tag>의심</Tag>}
            </>
          }
        />
      )}
    </section>
  );
}
