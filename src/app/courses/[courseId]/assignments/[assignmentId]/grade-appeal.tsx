import { UserLink } from "@/components/user-link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { AnswerForm, AppealForm, WithdrawAppealButton } from "./appeal-forms";

type Answer = { answer: string | null; answered_at: string | null };

/** The signed-in 수강생's 점수 이의신청 for one 과제: the button after the 마감일, then its status. */
export async function MyAppeal({ assignmentId, studentId }: { assignmentId: string; studentId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: appeal }, { data: canAppeal }] = await Promise.all([
    supabase
      .from("grade_appeal")
      .select("body, created_at, answer, answered_at")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase.rpc("can_appeal", { target_assignment: assignmentId }),
  ]);
  // Before the 마감일 there is nothing to appeal yet.
  if (!appeal && !canAppeal) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">점수 이의신청</h2>
      {appeal ? (
        <>
          <p className="text-sm">
            <span className="font-medium">{appeal.answer ? "답변 받음" : "답변 기다리는 중"}</span>{" "}
            <span className="text-muted-foreground">· {formatKst(appeal.created_at)}에 신청</span>
          </p>
          <p className="text-sm whitespace-pre-wrap">{appeal.body}</p>
          <AnswerBox appeal={appeal} />
          {!appeal.answer && <WithdrawAppealButton assignmentId={assignmentId} />}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            점수가 이상하다고 생각되면 이의신청을 남겨 주세요. 담당 교수님과 조교만 읽고 답변해요. 과제마다 한 번 할 수 있어요.
          </p>
          <AppealForm assignmentId={assignmentId} />
        </>
      )}
    </section>
  );
}

/** Every 이의신청 on one 과제, for its 교수·조교 (RLS lets only them read others'). */
export async function GradeAppeals({ assignmentId }: { assignmentId: string }) {
  const supabase = await createServerSupabase();
  const { data: appeals } = await supabase
    .from("grade_appeal")
    .select("student_id, body, created_at, answer, answered_at, student:profile!grade_appeal_student_id_fkey(name, student_number)")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (!appeals?.length) return null;
  const waiting = appeals.filter((a) => !a.answer).length;

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">
        점수 이의신청 <span className="text-sm font-normal text-muted-foreground">· 답변 기다림 {waiting}건</span>
      </h2>
      <ul className="flex flex-col divide-y">
        {appeals.map((appeal) => (
          <li key={appeal.student_id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <p className="text-sm">
              <UserLink userId={appeal.student_id} name={appeal.student?.name ?? "탈퇴한 사용자"} />{" "}
              <span className="text-muted-foreground">
                {appeal.student?.student_number ?? ""} · {formatKst(appeal.created_at)}
              </span>
            </p>
            <p className="text-sm whitespace-pre-wrap">{appeal.body}</p>
            {appeal.answer ? <AnswerBox appeal={appeal} /> : <AnswerForm assignmentId={assignmentId} studentId={appeal.student_id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnswerBox({ appeal }: { appeal: Answer }) {
  if (!appeal.answer) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground">
        답변{appeal.answered_at ? ` · ${formatKst(appeal.answered_at)}` : ""}
      </span>
      <p className="whitespace-pre-wrap">{appeal.answer}</p>
    </div>
  );
}
