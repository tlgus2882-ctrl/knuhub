import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { UserActions } from "./user-actions";

const ROLE_LABEL = { student: "학생", professor: "교수", admin: "관리자" } as const;

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">관리자 페이지</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {searchParams.then(({ q }) => (
          <AdminView query={typeof q === "string" ? q.trim() : ""} />
        ))}
      </Suspense>
    </main>
  );
}

// Everything here is read through admin-only DB functions and RLS (supabase/migrations/*_admin.sql);
// the is_admin() check only picks what to show.
async function AdminView({ query }: { query: string }) {
  const supabase = await createServerSupabase();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  // Others get the plain 404, as if there were no such page.
  if (!isAdmin) notFound();

  const [{ data: users }, { data: archived }] = await Promise.all([
    supabase.rpc("admin_list_users", { query }),
    supabase.from("archived_course").select("id, name, semester, section, professor_name, archived_at").order("archived_at", { ascending: false }),
  ]);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">사용자</h2>
        <form action="/admin" role="search" className="flex gap-2">
          <Input name="q" type="search" defaultValue={query} placeholder="이름, 학번, 학교 메일" aria-label="사용자 검색" />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {query ? `"${query}" 검색 결과` : "최근 가입한 순서"} · {users?.length ?? 0}명{users?.length === 200 && " (200명까지 보여요)"}
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">학교 메일</th>
                <th className="px-4 py-2 font-medium">역할</th>
                <th className="px-4 py-2 font-medium">가입</th>
                <th className="px-4 py-2 font-medium">학번 · 승격</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users?.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-2">
                    <Link href={`/users/${user.id}`} className="text-primary underline">
                      {user.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-2">{ROLE_LABEL[user.role]}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatKst(user.created_at)}</td>
                  <td className="px-4 py-2">
                    <UserActions userId={user.id} name={user.name} role={user.role} studentNumber={user.student_number} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">보관된 과목</h2>
        <p className="text-sm text-muted-foreground">담당 교수가 탈퇴해서 서비스 화면에서 내려간 과목이에요.</p>
        {archived?.length ? (
          <ul className="flex flex-col divide-y rounded-xl border">
            {archived.map((course) => (
              <li key={course.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <Link href={`/admin/archived/${course.id}`} className="font-medium text-primary underline">
                  {course.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {course.semester}학기 · {course.section}분반 · {course.professor_name} 교수 · {formatKst(course.archived_at)} 보관
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">보관된 과목이 없어요.</p>
        )}
      </section>
    </>
  );
}
