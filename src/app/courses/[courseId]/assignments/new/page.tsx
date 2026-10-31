import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { defaultDueInput } from "@/lib/time";
import { AssignmentForm } from "../assignment-form";

export default function NewAssignmentPage({ params }: PageProps<"/courses/[courseId]/assignments/new">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense>
        {params.then(({ courseId }) => (
          <>
            <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline hover:text-primary">
              ← 과목으로
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">과제 만들기</h1>
            <NewAssignmentForm courseId={courseId} />
          </>
        ))}
      </Suspense>
    </main>
  );
}

// The default 마감 (a week from today) depends on when the page is opened, so it renders per request.
async function NewAssignmentForm({ courseId }: { courseId: string }) {
  await connection();
  return <AssignmentForm courseId={courseId} defaultDue={defaultDueInput(new Date())} />;
}
