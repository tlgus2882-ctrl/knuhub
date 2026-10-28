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
import { GradedButton } from "./graded-button";
import { GradingCriteria } from "./grading-criteria";
import { MySubmission } from "./my-submission";
import { SelfCheck } from "./self-check";
import { SubmissionList } from "./submission-list";
import { SubmissionStatus } from "./submission-status";
import { FirstCheck } from "./first-check";

export default function AssignmentPage({ params }: PageProps<"/courses/[courseId]/assignments/[assignmentId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
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
    .select("id, title, description, due_at, visibility, published, graded_at, course(name)")
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
  const closed = now >= new Date(assignment.due_at);

  return (
    <>
      <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline hover:text-primary">
        ← {assignment.course?.name}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/courses/${courseId}/assignments/${assignmentId}/edit`} />}
            >
              고치기
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">마감</dt>
          <dd>
            {formatKst(assignment.due_at)} <span className="font-medium">({timeLeft(assignment.due_at, now)})</span>
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
            {assignment.graded_at ? (
              <span>채점 완료 <span className="text-muted-foreground">· {formatKst(assignment.graded_at)}</span></span>
            ) : (
              <span>
                {closed ? "채점 중" : "마감 전"}{" "}
                <span className="text-muted-foreground">· 채점이 끝나면 공개 범위에 따라 제출물이 공개돼요.</span>
              </span>
            )}
            {/* Before the 마감일 the button would open nothing yet, so it waits for the deadline. */}
            {canEdit && closed && <GradedButton assignmentId={assignmentId} graded={Boolean(assignment.graded_at)} />}
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

      {enrolled && user && <MySubmission courseId={courseId} assignmentId={assignmentId} studentId={user.id} open={Boolean(canSubmit)} />}
      {enrolled && user && <SelfCheck courseId={courseId} assignmentId={assignmentId} studentId={user.id} open={Boolean(canSubmit)} />}
      {enrolled && user && <MyAppeal assignmentId={assignmentId} studentId={user.id} />}

      {canEdit && <GradeAppeals assignmentId={assignmentId} />}

      {canEdit && <FirstCheck assignmentId={assignmentId} />}
      {canEdit && <SubmissionStatus courseId={courseId} assignmentId={assignmentId} />}

      <SubmissionList courseId={courseId} assignmentId={assignmentId} viewerId={enrolled ? user?.id : undefined} />
    </>
  );
}
