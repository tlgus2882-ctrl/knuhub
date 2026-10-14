import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthorCard } from "@/components/author-card";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";

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
    supabase.from("profile").select("id, name, student_number, role").eq("id", userId).maybeSingle(),
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
      {auth.user?.id === profile.id && (
        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/profile" />}>
          내 프로필 고치기
        </Button>
      )}
    </>
  );
}
