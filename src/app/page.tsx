import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createServerSupabase, type ServerSupabase as Supabase } from "@/lib/supabase/server";
import { courseTerm } from "./courses/course-term";
import { JoinCourseForm } from "./courses/join-course-form";
import { SearchBox } from "./search/search-box";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      <Suspense>
        {searchParams.then(({ withdrawn }) =>
          withdrawn === "1" ? (
            <p className="rounded-lg border p-3 text-sm">탈퇴가 끝났어요. 프로필, 제출물, 리뷰를 모두 지웠어요.</p>
          ) : null,
        )}
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">세션 확인 중…</p>}>
        <SignedInHome />
      </Suspense>
    </main>
  );
}

type CourseSummary = { id: string; name: string; semester: string; section: string };

async function SignedInHome() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button nativeButton={false} render={<Link href="/login" />}>
          로그인
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/signup" />}>
          가입하기
        </Button>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profile")
    .select("name, student_number, role")
    .eq("id", user.id)
    .single();

  return (
    <>
      <p className="text-base">
        {profile?.name}
        {profile?.student_number && ` (${profile.student_number})`}님, 안녕하세요.
      </p>
      <SearchBox />
      {profile?.role === "professor" && <ProfessorCourses supabase={supabase} userId={user.id} />}
      {profile?.role === "student" && <StudentCourses supabase={supabase} userId={user.id} />}
    </>
  );
}

async function ProfessorCourses({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data } = await supabase
    .from("course")
    .select("id, name, semester, section")
    .eq("professor_id", userId)
    .order("created_at", { ascending: false });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">담당 과목</h2>
        <div className="flex gap-2">
          <BrowseCoursesButton />
          <Button size="sm" nativeButton={false} render={<Link href="/courses/new" />}>
            과목 열기
          </Button>
        </div>
      </div>
      <CourseList courses={data ?? []} empty="아직 연 과목이 없어요." />
    </section>
  );
}

async function StudentCourses({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data } = await supabase
    .from("enrollment")
    .select("course(id, name, semester, section)")
    .eq("student_id", userId)
    .order("created_at", { ascending: false });
  const courses = (data ?? []).flatMap((row) => (row.course ? [row.course] : []));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">내 과목</h2>
        <BrowseCoursesButton />
      </div>
      <CourseList
        courses={courses}
        empty="아직 참여한 과목이 없어요. 교수님께 받은 초대 코드를 입력해 주세요."
      />
      <JoinCourseForm />
    </section>
  );
}

function BrowseCoursesButton() {
  return (
    <Button size="sm" nativeButton={false} render={<Link href="/courses" />}>
      전체 과목 둘러보기 →
    </Button>
  );
}

function CourseList({ courses, empty }: { courses: CourseSummary[]; empty: string }) {
  if (courses.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {courses.map((course) => (
        <li key={course.id}>
          <Link href={`/courses/${course.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
            <span className="font-medium">{course.name}</span>
            <span className="text-xs text-muted-foreground">{courseTerm(course)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
