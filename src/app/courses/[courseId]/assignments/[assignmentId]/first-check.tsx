import { createServerSupabase } from "@/lib/supabase/server";
import { FirstCheckPanel } from "./first-check-panel";
import { formatKst } from "@/lib/time";
import { GradedButton } from "./graded-button";

/** 채점 완료: not yet, done at `at`, or set to happen by itself at `at` (the 지각 제출 마감). */
export type Grading = { state: "none" } | { state: "done" | "scheduled"; at: string };

type Props = {
  assignmentId: string;
  /** The 마감 has passed: grading may start (also during 지각 제출). */
  pastDue: boolean;
  grading: Grading;
};

// 1차 검사 and 채점 완료 for the course's professor and assistants (the page shows it to them only;
// request_first_check(), claim_first_check() and the assignment RLS are what actually decide).
export async function FirstCheckAndGrading({ assignmentId, pastDue, grading }: Props) {
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
          마감 후 제출물을 한꺼번에 채점 항목별로 AI에게 검사받아요. 부족이나 판단 불가가 하나라도 있으면 의심
          표시가 붙어요. 결과는 교수님과 조교만 봐요.
        </p>
      </div>
      {canRun ? (
        <FirstCheckPanel assignmentId={assignmentId} total={total} remaining={remaining} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {assignment?.criteria_version ? "마감 후에 1차 검사를 할 수 있어요." : "채점 항목을 먼저 정해 주세요."}
        </p>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground">
          마감이 지나면 지각 제출 기간에도 채점하고 채점 완료를 누를 수 있어요. 제출물 공개와 점수 이의신청은 지각 제출 마감이 지난 뒤에
          열려요. 지각 제출을 받는 과제는 지각 제출 마감에 자동으로 채점 완료돼요. 취소하면 다시 숨겨져요.
        </p>
        {grading.state === "scheduled" && (
          <p className="text-sm">
            <span className="font-medium">{formatKst(grading.at)}</span> 지각 제출 마감에 자동으로 채점 완료돼요.
          </p>
        )}
        {pastDue ? (
          <GradedButton assignmentId={assignmentId} state={grading.state} />
        ) : (
          <p className="text-sm text-muted-foreground">마감 후에 누를 수 있어요.</p>
        )}
      </div>
    </section>
  );
}
