import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst, timeLeft } from "@/lib/time";
import { asCourseRole } from "../../../course-role";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "../../../visibility";
import { Attachments } from "./attachments";
import { GradeAppeals, MyAppeal } from "./grade-appeal";
import { GradingCriteria } from "./grading-criteria";
import { MySubmission } from "./my-submission";
import { SelfCheck } from "./self-check";
import { SubmissionList } from "./submission-list";
import { SubmissionStatus } from "./submission-status";
import { DeleteAssignmentButton } from "./delete-assignment-button";
import { FirstCheckAndGrading, type Grading } from "./first-check";

export default function AssignmentPage({ params }: PageProps<"/courses/[courseId]/assignments/[assignmentId]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then((p) => (
          <AssignmentDetail {...p} />
        ))}
      </Suspense>
    </main>
  );
}

async function AssignmentDetail({ courseId, assignmentId }: { courseId: string; assignmentId: string }) {
  const supabase = await createServerSupabase();
  const { data: assignment } = await supabase
    .from("assignment")
    .select("id, title, description, due_at, late_due_at, closes_at, visibility, published, graded_at, course(name)")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!assignment) notFound();

  const { data: canEdit } = await supabase.rpc("is_professor_or_assistant", { target_course: courseId });
  const { data: role } = await supabase.rpc("my_course_role", { target_course: courseId });
  const myRole = asCourseRole(role);
  const enrolled = myRole === "student" || myRole === "assistant";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Whether submitting is still open comes from the DB (enrolled and before the current 마감일).
  const { data: canSubmit } = enrolled
    ? await supabase.rpc("can_submit", { target_assignment: assignmentId })
    : { data: false };
  await connection();
  const now = new Date();
  const pastDue = now >= new Date(assignment.due_at);
  // Submitting closes at the 지각 제출 마감 when there is one; 채점 완료 and the rest wait for it.
  // closes_at is a generated column that is never null (the generated types can't tell).
  const closed = now >= new Date(assignment.closes_at!);
  // 채점 완료 holds once graded_at has passed; a later graded_at is the automatic one at the 지각 제출 마감.
  const grading: Grading = !assignment.graded_at
    ? { state: "none" }
    : new Date(assignment.graded_at) <= now
      ? { state: "done", at: assignment.graded_at }
      : { state: "scheduled", at: assignment.graded_at };

  return (
    <>
      <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline hover:text-primary">
        ← {assignment.course?.name}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
          {canEdit && (
            <div className="flex shrink-0 items-start gap-2">
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/courses/${courseId}/assignments/${assignmentId}/edit`} />}
              >
                고치기
              </Button>
              <DeleteAssignmentButton courseId={courseId} assignmentId={assignmentId} title={assignment.title} />
            </div>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">마감</dt>
          <dd>
            {formatKst(assignment.due_at)} <span className="font-medium">({timeLeft(assignment.due_at, now)})</span>
          </dd>
          <dt className="text-muted-foreground">지각 제출</dt>
          <dd>
            {assignment.late_due_at ? (
              <>
                {formatKst(assignment.late_due_at)}까지{" "}
                <span className="font-medium">({timeLeft(assignment.late_due_at, now)})</span>{" "}
                <span className="text-muted-foreground">· 마감 뒤에 낸 제출물은 지각으로 표시돼요.</span>
              </>
            ) : (
              <span className="text-muted-foreground">받지 않아요</span>
            )}
          </dd>
          {!assignment.published && (
            <>
              <dt className="text-muted-foreground">과제 공개</dt>
              <dd>
                비공개 <span className="text-muted-foreground">· 담당 교수와 조교만 봐요. 고치기에서 공개로 바꿀 수 있어요.</span>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">공개 범위</dt>
          <dd>
            {VISIBILITY_LABEL[assignment.visibility]}{" "}
            <span className="text-muted-foreground">· {VISIBILITY_HINT[assignment.visibility]}</span>
          </dd>
          <dt className="text-muted-foreground">채점</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {grading.state === "done" ? (
              <span>
                채점 완료 <span className="text-muted-foreground">· {formatKst(grading.at)}</span>
                {!closed && <span className="text-muted-foreground"> · 제출물은 지각 제출 마감 뒤에 공개돼요.</span>}
              </span>
            ) : (
              <span>
                {pastDue ? "채점 중" : "마감 전"}{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {grading.state === "scheduled"
                    ? `${formatKst(grading.at)} 지각 제출 마감에 자동으로 채점 완료되고, 공개 범위에 따라 제출물이 공개돼요.`
                    : "채점이 끝나면 공개 범위에 따라 제출물이 공개돼요."}
                </span>
              </span>
            )}
          </dd>
        </dl>
      </header>

      {assignment.description ? (
        <Markdown>{assignment.description}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">설명이 없어요.</p>
      )}

      <GradingCriteria assignmentId={assignmentId} canEdit={Boolean(canEdit)} />

      <Attachments assignmentId={assignmentId} canEdit={Boolean(canEdit)} />

      {/* 내 제출물 · 셀프 점검 · 점수 이의신청 · 1차 검사 as a 2x2 grid (one column on phones). */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {enrolled && user && <MySubmission courseId={courseId} assignmentId={assignmentId} studentId={user.id} open={Boolean(canSubmit)} dueAt={assignment.due_at} lateDueAt={assignment.late_due_at} pastDue={pastDue} />}
        {enrolled && user && <SelfCheck courseId={courseId} assignmentId={assignmentId} studentId={user.id} open={Boolean(canSubmit)} />}
        {enrolled && user && <MyAppeal assignmentId={assignmentId} studentId={user.id} />}
        {canEdit && <GradeAppeals assignmentId={assignmentId} />}
        {canEdit && <FirstCheckAndGrading assignmentId={assignmentId} pastDue={pastDue} grading={grading} />}
      </div>
      {canEdit && <SubmissionStatus courseId={courseId} assignmentId={assignmentId} dueAt={assignment.due_at} />}

      <SubmissionList courseId={courseId} assignmentId={assignmentId} dueAt={assignment.due_at} viewerId={enrolled ? user?.id : undefined} />
    </>
  );
}
