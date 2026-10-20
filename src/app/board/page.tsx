import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABEL, toCategory, type PostCategory } from "./categories";
import { PostList } from "./post-list";

// shortcut: shows the newest 100 posts with no paging, add paging when the board outgrows that.
const PAGE_SIZE = 100;

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">메인 게시판</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {searchParams.then(({ category }) => (
          <Board category={toCategory(category)} />
        ))}
      </Suspense>
    </main>
  );
}

function Board({ category }: { category: PostCategory | null }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="말머리" className="flex flex-wrap gap-2">
          {[null, ...CATEGORIES].map((c) => (
            <Link
              key={c ?? "all"}
              href={c ? `/board?category=${c}` : "/board"}
              aria-current={c === category ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm hover:bg-muted",
                c === category && "border-primary bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {c ? CATEGORY_LABEL[c] : "전체"}
            </Link>
          ))}
        </nav>
        <Button size="sm" nativeButton={false} render={<Link href={category ? `/board/new?category=${category}` : "/board/new"} />}>
          글쓰기
        </Button>
      </div>
      <PostList category={category} limit={PAGE_SIZE} />
    </>
  );
}
