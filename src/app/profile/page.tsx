import Link from "next/link";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← 처음으로
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">프로필</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        <MyProfile />
      </Suspense>
    </main>
  );
}

async function MyProfile() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // the proxy sends signed-out visitors to /login

  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase.from("profile").select("name, student_number").eq("id", user.id).single(),
    supabase
      .from("profile_contact")
      .select("show_email, open_chat_url, github, contact_visibility")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">학번</dt>
        <dd>
          {profile?.student_number ?? "없음"}{" "}
          <span className="text-muted-foreground">· 학번은 고칠 수 없어요. 잘못됐다면 관리자에게 문의해 주세요.</span>
        </dd>
      </dl>
      <ProfileForm
        email={user.email ?? ""}
        name={profile?.name ?? ""}
        contact={contact ?? { show_email: false, open_chat_url: null, github: null, contact_visibility: "private" }}
      />
    </>
  );
}
