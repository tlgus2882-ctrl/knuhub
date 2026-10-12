import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst, timeLeft } from "@/lib/time";
import { VISIBILITY_HINT, VISIBILITY_LABEL } from "../../../visibility";

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
    .select("id, title, description, due_at, visibility, course(name)")
    .eq("id", assignmentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!assignment) notFound();

  const { data: canEdit } = await supabase.rpc("is_professor_or_assistant", { target_course: courseId });
  await connection();
  const now = new Date();

  return (
    <>
      <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline">
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
          <dt className="text-muted-foreground">공개 범위</dt>
          <dd>
            {VISIBILITY_LABEL[assignment.visibility]}{" "}
            <span className="text-muted-foreground">· {VISIBILITY_HINT[assignment.visibility]}</span>
          </dd>
        </dl>
      </header>

      {assignment.description ? (
        <Markdown>{assignment.description}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">설명이 없어요.</p>
      )}
    </>
  );
}
