import { createServerSupabase } from "@/lib/supabase/server";
import { FirstCheckPanel } from "./first-check-panel";
import { GradedButton } from "./graded-button";

type Props = {
  assignmentId: string;
  /** Submitting has closed (the 지각 제출 마감, or the 마감 when there is none). */
  closed: boolean;
  graded: boolean;
  /** The 과제 takes 지각 제출. */
  late: boolean;
};

// 1차 검사 and 채점 완료 for the course's professor and assistants (the page shows it to them only;
// request_first_check(), claim_first_check() and the assignment RLS are what actually decide).
export async function FirstCheck({ assignmentId, closed, graded, late }: Props) {
  const after = late ? "지각 제출 마감 후" : "마감 후";
  const supabase = await createServerSupabase();
  const [{ data: canRun }, { data: progress }, { data: assignment }] = await Promise.all([
    supabase.rpc("can_run_first_check", { target_assignment: assignmentId }),
    supabase.rpc("first_check_progress", { target_assignment: assignmentId }),
    supabase.from("assignment").select("criteria_version").eq("id", assignmentId).single(),
  ]);
  const { total = 0, remaining = 0 } = progress?.[0] ?? {};

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">1차 검사 · 채점 완료</h2>
        <p className="text-sm text-muted-foreground">
          {after} 제출물을 한꺼번에 채점 항목별로 AI에게 검사받아요. 부족이나 판단 불가가 하나라도 있으면 의심
          표시가 붙어요. 결과는 교수님과 조교만 봐요.
        </p>
      </div>
      {canRun ? (
        <FirstCheckPanel assignmentId={assignmentId} total={total} remaining={remaining} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {assignment?.criteria_version ? `${after}에 1차 검사를 할 수 있어요.` : "채점 항목을 먼저 정해 주세요."}
        </p>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          채점을 마치면 채점 완료를 눌러 주세요. 그때부터 공개 범위에 따라 제출물이 공개되고, 학생들이 점수 이의신청을 할 수 있어요.
          취소하면 다시 숨겨져요.
        </p>
        {/* Before submitting closes the button would open nothing yet, so it waits. */}
        {closed ? (
          <GradedButton assignmentId={assignmentId} graded={graded} />
        ) : (
          <p className="text-sm text-muted-foreground">{after}에 누를 수 있어요.</p>
        )}
      </div>
    </section>
  );
}
