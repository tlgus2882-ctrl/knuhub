import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { LoginCard } from "./(auth)/login/login-card";
import { PostList } from "./board/post-list";
import { MascotGreeting } from "./mascot-greeting";
import { RecentRecommendations } from "./recommendations/recent-recommendations";
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
            <p className="rounded-lg border p-3 text-sm">탈퇴가 끝났어요. 프로필, 제출물, 리뷰, 게시판 글과 댓글을 모두 지웠어요.</p>
          ) : null,
        )}
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">세션 확인 중…</p>}>
        <SignedInHome searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// A Server Component renders once per request (this part already reads the session),
// so each visit starts the mascot on a different line.
function randomSeed() {
  return Math.random();
}

type CourseSummary = { id: string; name: string; semester: string; section: string };

async function SignedInHome({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The same card as /login, sized like the auth pages but nearer the top.
    return (
      <div className="mx-auto w-full max-w-md pt-10">
        <LoginCard searchParams={searchParams} />
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
      {/* Only beside the page on the left, where there is room (the 교수 추천 list sits on the right); hidden on smaller screens. */}
      <div className="hidden 2xl:fixed 2xl:top-24 2xl:left-4 2xl:block 2xl:w-64">
        <MascotGreeting name={profile?.name ?? ""} seed={randomSeed()} />
      </div>
      <div className="flex justify-end">
        <SearchBox className="w-full sm:w-72" />
      </div>
      {profile?.role === "professor" && <ProfessorCourses supabase={supabase} userId={user.id} />}
      {profile?.role === "student" && <StudentCourses supabase={supabase} userId={user.id} />}
      <div className="2xl:hidden">
        <RecentRecommendations />
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">메인 게시판</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/board" />}>
              전체 보기 →
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/board/new" />}>
              글쓰기
            </Button>
          </div>
        </div>
        <PostList category={null} limit={5} />
      </section>
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
        <h2 className="text-xl font-bold">담당 과목</h2>
        <Button size="sm" nativeButton={false} render={<Link href="/courses/new" />}>
          과목 열기
        </Button>
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
      <h2 className="text-xl font-bold">내 과목</h2>
      <CourseList
        courses={courses}
        empty="아직 참여한 과목이 없어요. 교수님께 받은 초대 코드를 입력해 주세요."
      />
      <JoinCourseForm />
    </section>
  );
}

function CourseList({ courses, empty }: { courses: CourseSummary[]; empty: string }) {
  if (courses.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={`/courses/${course.id}`}
            className="flex h-full flex-col gap-1 rounded-xl border p-5 transition-colors hover:border-primary hover:bg-muted"
          >
            <span className="text-lg font-semibold">{course.name}</span>
            <span className="text-sm text-muted-foreground">{courseTerm(course)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
