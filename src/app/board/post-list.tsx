import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { CATEGORY_LABEL, type PostCategory } from "./categories";

/** Newest 메인 게시판 posts, optionally of one 말머리. */
export async function PostList({ category, limit }: { category: PostCategory | null; limit: number }) {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("post")
    .select("id, category, title, created_at, profile(name), post_comment(count)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);
  const { data: posts } = await query;

  if (!posts?.length) return <p className="text-sm text-muted-foreground">아직 글이 없어요.</p>;

  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {posts.map((post) => (
        <li key={post.id}>
          <Link href={`/board/${post.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
            <span className="min-w-0 truncate">
              <span className="mr-2 text-sm text-primary">[{CATEGORY_LABEL[post.category]}]</span>
              <span className="font-medium">{post.title}</span>
              {post.post_comment[0]?.count ? <span className="ml-1 text-sm text-muted-foreground">({post.post_comment[0].count})</span> : null}
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
