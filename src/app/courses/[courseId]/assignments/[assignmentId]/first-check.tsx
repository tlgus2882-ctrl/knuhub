import { createServerSupabase } from "@/lib/supabase/server";
import { FirstCheckPanel } from "./first-check-panel";

// 1차 검사 for the course's professor and assistants (the page shows it to them only;
// request_first_check() and claim_first_check() are what actually decide).
export async function FirstCheck({ assignmentId }: { assignmentId: string }) {
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
        <h2 className="text-lg font-semibold">1차 검사</h2>
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
    </section>
  );
}
