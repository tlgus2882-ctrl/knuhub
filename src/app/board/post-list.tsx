import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";
import { postLabel, type PostCategory } from "./categories";

type Board = { courseId: string; category?: undefined } | { courseId?: undefined; category: PostCategory | null };

/** Newest posts of a 과목 게시판 (공지 first), or of the 메인 게시판, optionally of one 말머리. */
export async function PostList({ limit, ...board }: Board & { limit: number }) {
  const supabase = await createServerSupabase();
  let query = supabase.from("post").select("id, category, is_notice, title, created_at, profile(name), post_comment(count), post_like(count)");
  if (board.courseId) query = query.eq("course_id", board.courseId).order("is_notice", { ascending: false });
  else query = query.is("course_id", null);
  if (board.category) query = query.eq("category", board.category);
  query = query.order("created_at", { ascending: false }).limit(limit);
  const { data: posts } = await query;

  if (!posts?.length) return <p className="text-sm text-muted-foreground">아직 글이 없어요.</p>;

  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {posts.map((post) => (
        <li key={post.id} className={post.is_notice ? "bg-primary/5" : undefined}>
          <Link href={`/board/${post.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
            <span className="min-w-0 truncate">
              {postLabel(post) && (
                <span className={cn("mr-2 text-sm text-primary", post.is_notice && "font-semibold")}>[{postLabel(post)}]</span>
              )}
              <span className="font-medium">{post.title}</span>
              {post.post_comment[0]?.count ? <span className="ml-1 text-sm text-muted-foreground">({post.post_comment[0].count})</span> : null}
              {post.post_like[0]?.count ? <span className="ml-1 text-sm text-red-500">♥ {post.post_like[0].count}</span> : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {post.profile?.name ?? "알 수 없음"} · {formatKst(post.created_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
