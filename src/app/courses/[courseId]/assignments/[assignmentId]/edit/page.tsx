import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { toKstInputValue } from "@/lib/time";
import { AssignmentForm } from "../../assignment-form";

export default function EditAssignmentPage({
  params,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then((p) => (
          <EditAssignment {...p} />
        ))}
      </Suspense>
    </main>
  );
}

async function EditAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }) {
  const supabase = await createServerSupabase();
  const { data: assignment } = await supabase
    .from("assignment")
    .select("id, title, description, due_at, late_due_at, visibility, published")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!assignment) notFound();

  const { data: canEdit } = await supabase.rpc("is_professor_or_assistant", { target_course: courseId });
  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        이 과목의 담당 교수나 조교만 과제를 고칠 수 있어요.{" "}
        <Link href={`/courses/${courseId}/assignments/${assignmentId}`} className="text-primary underline">
          과제로 돌아가기
        </Link>
      </p>
    );
  }

  return (
    <>
      <Link href={`/courses/${courseId}/assignments/${assignmentId}`} className="text-sm text-muted-foreground underline hover:text-primary">
        ← 과제로
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">과제 고치기</h1>
      <AssignmentForm
        courseId={courseId}
        assignment={{
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          dueInput: toKstInputValue(assignment.due_at),
          lateInput: assignment.late_due_at && toKstInputValue(assignment.late_due_at),
          visibility: assignment.visibility,
          published: assignment.published,
        }}
      />
    </>
  );
}
