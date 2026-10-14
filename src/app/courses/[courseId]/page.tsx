import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { asCourseRole } from "../course-role";
import { courseTerm } from "../course-term";
import { regenerateInviteCode } from "../actions";
import { AssignmentList } from "./assignment-list";
import { Roster } from "./roster";

export default function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground underline hover:text-primary">
        ← 내 과목
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then(({ courseId }) => (
          <CourseDetail courseId={courseId} />
        ))}
      </Suspense>
    </main>
  );
}

async function CourseDetail({ courseId }: { courseId: string }) {
  const supabase = await createServerSupabase();
  const { data: course } = await supabase
    .from("course")
    .select("id, name, semester, section, professor:profile!course_professor_id_fkey(name)")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();

  const { data: role } = await supabase.rpc("my_course_role", { target_course: courseId });
  const myRole = asCourseRole(role);
  const { data: canPost } = await supabase.rpc("is_professor_or_assistant", { target_course: courseId });

  // RLS returns the invite code only to the course's professor.
  const { data: invite } = await supabase
    .from("course_invite")
    .select("invite_code")
    .eq("course_id", courseId)
    .maybeSingle();

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{course.name}</h1>
        <p className="text-sm text-muted-foreground">
          {courseTerm(course)} · 담당 교수 {course.professor?.name}
          {myRole === "assistant" && " · 나는 이 과목의 조교"}
        </p>
      </header>

      {invite && (
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-medium">초대 코드</h2>
          <p className="mt-1 font-mono text-2xl tracking-widest">{invite.invite_code}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            학생들에게 이 코드를 알려 주세요. 코드를 입력하면 바로 수강생이 돼요.
          </p>
          <form action={regenerateInviteCode} className="mt-3">
            <input type="hidden" name="course_id" value={courseId} />
            <Button type="submit" size="sm" variant="outline">
              새 코드 발급
            </Button>
          </form>
          <p className="mt-1 text-xs text-muted-foreground">
            새 코드를 발급하면 이전 코드로는 참여할 수 없어요. 이미 참여한 수강생은 그대로예요.
          </p>
        </section>
      )}

      <AssignmentList courseId={courseId} canPost={canPost === true} />

      {myRole === "professor" && <Roster courseId={courseId} />}
    </>
  );
}
