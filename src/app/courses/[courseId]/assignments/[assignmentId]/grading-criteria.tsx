import { createServerSupabase } from "@/lib/supabase/server";
import { CriteriaEditor } from "./criteria-editor";

type Props = { assignmentId: string; canEdit: boolean };

// 채점 항목. RLS shows them to whoever may see the 과제 (docs/adr/0002); the professor and
// assistants edit them, everyone else sees the saved (confirmed) list, if any.
export async function GradingCriteria({ assignmentId, canEdit }: Props) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("grading_criterion")
    .select("name, points, description")
    .eq("assignment_id", assignmentId)
    .order("position");
  const criteria = data ?? [];
  if (!criteria.length && !canEdit) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">채점 항목</h2>
      {canEdit ? (
        <>
          <p className="text-sm text-muted-foreground">
            저장한 채점 항목으로 셀프 점검과 1차 검사를 해요. 저장하기 전에는 둘 다 열리지 않아요.
          </p>
          <CriteriaEditor assignmentId={assignmentId} initial={criteria} />
        </>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border text-sm">
          {criteria.map((c, i) => (
            <li key={i} className="flex gap-3 px-3 py-2">
              <span className="text-muted-foreground">{i + 1}</span>
              <div className="flex-1">
                <p className="font-medium">{c.name}</p>
                {c.description && <p className="text-muted-foreground">{c.description}</p>}
              </div>
              <span className="shrink-0">{c.points}점</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
