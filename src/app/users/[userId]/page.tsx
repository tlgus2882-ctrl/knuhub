import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthorCard } from "@/components/author-card";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { RecommendedBadge } from "../../recommendations/recommended-badge";
import { submissionHref } from "../../courses/[courseId]/assignments/[assignmentId]/submissions/submission-href";

const ROLE_LABEL: Record<Database["public"]["Enums"]["role"], string> = {
  student: "학생",
  professor: "교수",
  admin: "관리자",
};

// Someone else's profile: what anyone may see on their 작성자 카드, plus their role.
// Contacts show only as far as their 연락처 공개 범위 allows (docs/adr/0002).
export default function UserPage({ params }: PageProps<"/users/[userId]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">프로필</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then(({ userId }) => (
          <UserProfile userId={userId} />
        ))}
      </Suspense>
    </main>
  );
}

async function UserProfile({ userId }: { userId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from("profile").select("id, name, student_number, role, bio").eq("id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!profile) notFound();

  return (
    <>
      <AuthorCard authorId={profile.id} name={profile.name} studentNumber={profile.student_number} linkName={false} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">역할</dt>
        <dd>{ROLE_LABEL[profile.role]}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">연락처는 이 사용자가 정한 공개 범위 안에서만 보여요.</p>
      {profile.bio && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">자기소개</h2>
          <p className="text-sm whitespace-pre-wrap break-words">{profile.bio}</p>
        </section>
      )}
      {profile.role === "student" && <VisibleSubmissions studentId={profile.id} />}
      {auth.user?.id === profile.id && (
        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/profile" />}>
          내 프로필 고치기
        </Button>
      )}
    </>
  );
}

// The same submission RLS as everywhere (공개 범위 and 마감일), so only what the viewer may see is listed.
async function VisibleSubmissions({ studentId }: { studentId: string }) {
  const supabase = await createServerSupabase();
  const { data: submissions } = await supabase
    .from("submission")
    .select("id, submitted_at, assignment(id, title, course_id, course(name)), recommendation(submission_id)")
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        제출물 <span className="text-muted-foreground">{submissions?.length ?? 0}</span>
      </h2>
      {submissions?.length ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {submissions.map((s) =>
            s.assignment ? (
              <li key={s.id}>
                <Link
                  href={submissionHref(s.assignment.course_id, s.assignment.id, s.id)}
                  className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {s.assignment.title}
                    {s.recommendation && <RecommendedBadge />}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.assignment.course?.name} · {formatKst(s.submitted_at)} 제출
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">내가 볼 수 있는 제출물이 없어요. 마감 전이거나 공개 범위 밖인 제출물은 보이지 않아요.</p>
      )}
    </section>
  );
}
