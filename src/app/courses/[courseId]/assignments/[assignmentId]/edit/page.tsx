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
      <Suspense>{params.then((p) => <EditAssignment {...p} />)}</Suspense>
    </main>
  );
}

async function EditAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }) {
  const supabase = await createServerSupabase();
  const { data: assignment } = await supabase
    .from("assignment")
    .select("id, title, description, due_at, visibility")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!assignment) notFound();

  return (
    <>
      <Link href={`/courses/${courseId}/assignments/${assignmentId}`} className="text-sm text-muted-foreground underline">
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
          visibility: assignment.visibility,
        }}
      />
    </>
  );
}
