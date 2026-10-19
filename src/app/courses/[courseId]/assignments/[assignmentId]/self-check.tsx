import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { AiReviewResult } from "./ai-review-result";
import { SelfCheckButton } from "./self-check-button";

type Props = { courseId: string; assignmentId: string; studentId: string; open: boolean };

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

  const remaining = `남은 횟수 ${max - (usage?.used ?? 0)}/${max}`;

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
        <p className="text-sm text-muted-foreground">마감이 지나서 셀프 점검을 쓸 수 없어요. ({remaining})</p>
      ) : !submission ? (
        <p className="text-sm text-muted-foreground">제출하면 셀프 점검을 쓸 수 있어요. ({remaining})</p>
      ) : (
        <SelfCheckButton assignmentId={assignmentId} remaining={max - (usage?.used ?? 0)} limit={max} />
      )}

      {submission?.self_check.map((result) => (
        <AiReviewResult
          key={result.id}
          courseId={courseId}
          assignmentId={assignmentId}
          submission={submission}
          criteriaVersion={criteriaVersion}
          result={result}
          title={`${formatKst(result.created_at)} 점검`}
        />
      ))}
    </section>
  );
}
