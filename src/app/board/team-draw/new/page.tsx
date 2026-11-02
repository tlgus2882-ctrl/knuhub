import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { defaultDueInput } from "@/lib/time";
import { TeamDrawForm } from "../team-draw-form";

// ?course=<id>: posts a 팀 추첨 on that course's 과목 게시판 (its professor only).
export default function NewTeamDrawPage({ searchParams }: PageProps<"/board/team-draw/new">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">팀 추첨 만들기</h1>
      <Suspense>
        {searchParams.then(({ course }) => (
          <NewTeamDraw courseId={typeof course === "string" ? course : null} />
        ))}
      </Suspense>
    </main>
  );
}

async function NewTeamDraw({ courseId }: { courseId: string | null }) {
  if (!courseId) notFound();
  const supabase = await createServerSupabase();
  const [{ data: course }, { data: role }] = await Promise.all([
    supabase.from("course").select("name").eq("id", courseId).maybeSingle(),
    supabase.rpc("my_course_role", { target_course: courseId }),
  ]);
  // create_team_draw() refuses everyone else anyway, so don't offer the form.
  if (!course || role !== "professor") notFound();
  await connection();
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {course.name} 과목 게시판 위쪽에 올라가요. 결과는 확인하고 공개해야 수강생에게 보여요.
      </p>
      <TeamDrawForm courseId={courseId} defaultDue={defaultDueInput(new Date())} />
    </>
  );
}
