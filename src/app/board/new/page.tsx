import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { toCategory } from "../categories";
import { PostForm } from "../post-form";

// ?course=<id> writes on that course's 과목 게시판, otherwise on the 메인 게시판.
export default function NewPostPage({ searchParams }: PageProps<"/board/new">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">글쓰기</h1>
      <Suspense>
        {searchParams.then(({ category, course }) => (
          <NewPost courseId={typeof course === "string" ? course : null} category={category} />
        ))}
      </Suspense>
    </main>
  );
}

async function NewPost({ courseId, category }: { courseId: string | null; category: unknown }) {
  if (!courseId) {
    return (
      <>
        <p className="text-sm text-muted-foreground">메인 게시판 글은 로그인한 모든 사용자가 봐요. 글에 내 이름이 보여요.</p>
        <PostForm defaultCategory={toCategory(category)} />
      </>
    );
  }

  const supabase = await createServerSupabase();
  const [{ data: course }, { data: canNotice }] = await Promise.all([
    supabase.from("course").select("name").eq("id", courseId).maybeSingle(),
    supabase.rpc("is_professor_or_assistant", { target_course: courseId }),
  ]);
  return (
    <>
      <p className="text-sm text-muted-foreground">{course?.name} 과목 게시판 글은 그 과목 사람만 봐요. 글에 내 이름이 보여요.</p>
      <PostForm courseId={courseId} canNotice={canNotice === true} />
    </>
  );
}
