import { Suspense } from "react";
import { toCategory } from "../categories";
import { PostForm } from "../post-form";

export default function NewPostPage({ searchParams }: PageProps<"/board/new">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">글쓰기</h1>
      <p className="text-sm text-muted-foreground">메인 게시판 글은 로그인한 모든 사용자가 봐요. 글에 내 이름이 보여요.</p>
      <Suspense>
        {searchParams.then(({ category }) => (
          <PostForm defaultCategory={toCategory(category)} />
        ))}
      </Suspense>
    </main>
  );
}
