import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatKst } from "@/lib/time";
import { createServerSupabase } from "@/lib/supabase/server";

export default function ArchivedCoursePage({ params }: PageProps<"/admin/archived/[courseId]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/admin" className="text-sm text-muted-foreground underline hover:text-primary">
        ← 관리자 페이지
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then(({ courseId }) => (
          <ArchivedCourse courseId={courseId} />
        ))}
      </Suspense>
    </main>
  );
}

// A 보관된 과목 with its 과제, 제출물 and 리뷰. RLS lets only 관리자 read the archive.
async function ArchivedCourse({ courseId }: { courseId: string }) {
  const supabase = await createServerSupabase();
  const { data: course } = await supabase
    .from("archived_course")
    .select(
      "name, semester, section, professor_name, archived_at, archived_assignment(id, title, due_at, archived_submission(id, student_name, student_number, submitted_at, archived_submission_file(path, size), archived_review(id, author_name, body, created_at)))",
    )
    .eq("id", courseId)
    .maybeSingle();
  // RLS shows the archive to 관리자 only, so everyone else gets the same 404 as a missing course.
  if (!course) notFound();

  const assignments = course.archived_assignment.toSorted((a, b) => a.due_at.localeCompare(b.due_at));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{course.name}</h1>
        <p className="text-sm text-muted-foreground">
          {course.semester}학기 · {course.section}분반 · {course.professor_name} 교수 · {formatKst(course.archived_at)} 보관
        </p>
      </header>
      {assignments.length ? (
        assignments.map((assignment) => (
          <section key={assignment.id} className="flex flex-col gap-3 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">
              {assignment.title} <span className="text-sm font-normal text-muted-foreground">마감 {formatKst(assignment.due_at)}</span>
            </h2>
            {assignment.archived_submission.length ? (
              <ul className="flex flex-col gap-3">
                {assignment.archived_submission.map((submission) => (
                  <li key={submission.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                    <span className="font-medium">
                      {submission.student_name} <span className="text-muted-foreground">{submission.student_number ?? "학번 없음"}</span>
                      <span className="font-normal text-muted-foreground"> · {formatKst(submission.submitted_at)} 제출</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {submission.archived_submission_file.map((f) => f.path).join(", ") || "파일 없음"}
                    </span>
                    {submission.archived_review.map((review) => (
                      <p key={review.id} className="rounded-md bg-muted/50 px-2 py-1">
                        <span className="font-medium">{review.author_name}</span>{" "}
                        <span className="text-xs text-muted-foreground">{formatKst(review.created_at)}</span>
                        <span className="block whitespace-pre-wrap">{review.body}</span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">제출물이 없어요.</p>
            )}
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">과제가 없어요.</p>
      )}
    </>
  );
}
