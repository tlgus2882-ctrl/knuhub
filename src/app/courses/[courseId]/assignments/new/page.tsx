import Link from "next/link";
import { Suspense } from "react";
import { AssignmentForm } from "../assignment-form";

export default function NewAssignmentPage({ params }: PageProps<"/courses/[courseId]/assignments/new">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense>
        {params.then(({ courseId }) => (
          <>
            <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline">
              ← 과목으로
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">과제 공지</h1>
            <AssignmentForm courseId={courseId} />
          </>
        ))}
      </Suspense>
    </main>
  );
}
