import Link from "next/link";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { compareSemestersNewestFirst, sectionLabel, semesterLabel } from "./course-term";

export default function BrowseCoursesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← 처음으로
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">과목 둘러보기</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <CoursesBySemester />
      </Suspense>
    </main>
  );
}

// 학기 → 과목 → 과제: any signed-in user may browse every course (RLS), not just their own.
// Signed-out visitors never get here: the proxy sends them to /login.
async function CoursesBySemester() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("course")
    .select("id, name, semester, section, professor:profile!course_professor_id_fkey(name), assignment(count)")
    .order("name")
    .order("section");
  if (error) {
    console.error("browse courses failed", error.message);
    return <p className="text-sm text-destructive">과목 목록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.</p>;
  }
  const courses = data;

  if (!courses.length) return <p className="text-sm text-muted-foreground">아직 열린 과목이 없어요.</p>;

  const semesters = [...Map.groupBy(courses, (course) => course.semester)].sort(([a], [b]) =>
    compareSemestersNewestFirst(a, b),
  );

  return (
    <div className="flex flex-col gap-8">
      {semesters.map(([semester, semesterCourses]) => (
        <section key={semester} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{semesterLabel(semester)}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {semesterCourses.map((course) => (
              <li key={course.id}>
                <Link href={`/courses/${course.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted">
                  <span>
                    <span className="font-medium">{course.name}</span>{" "}
                    <span className="text-sm text-muted-foreground">
                      {sectionLabel(course.section)} · 담당 교수 {course.professor?.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">과제 {course.assignment[0]?.count ?? 0}개</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
