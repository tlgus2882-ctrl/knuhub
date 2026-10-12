import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <p className="text-sm text-muted-foreground">
      {data.user ? `${data.user.email}로 로그인됨` : "로그인하지 않음"}
    </p>
  );
}
