import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { logOut } from "./(auth)/actions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">knuhub</h1>
      <p className="text-muted-foreground">강남대 과제 공유 & 리뷰 플랫폼</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">세션 확인 중…</p>}>
        <SessionStatus />
      </Suspense>
    </main>
  );
}

async function SessionStatus() {
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
    .select("name, student_number")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm">
        {profile?.name}
        {profile?.student_number && ` (${profile.student_number})`}님, 안녕하세요.
      </p>
      <form action={logOut}>
        <Button type="submit" variant="outline" size="sm">
          로그아웃
        </Button>
      </form>
    </div>
  );
}
