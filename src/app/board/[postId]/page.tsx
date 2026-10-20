import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { UserLink } from "@/components/user-link";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { CATEGORY_LABEL } from "../categories";
import { CommentForm } from "../comment-form";
import { CommentItem } from "../comment-item";
import { DeleteButton } from "../delete-button";
import { ReportButton } from "../report-button";

export default function PostPage({ params }: PageProps<"/board/[postId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/board" className="text-sm text-muted-foreground hover:underline">
        ← 메인 게시판
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then(({ postId }) => (
          <Post postId={postId} />
        ))}
      </Suspense>
    </main>
  );
}

const edited = (row: { created_at: string; updated_at: string }) => Date.parse(row.updated_at) > Date.parse(row.created_at);

async function Post({ postId }: { postId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: post }, { data: claims }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("post")
      .select("id, category, title, body, author_id, created_at, updated_at, profile(name), post_comment(id, body, author_id, created_at, updated_at, profile(name))")
      .eq("id", postId)
      .order("created_at", { referencedTable: "post_comment" })
      .maybeSingle(),
    supabase.auth.getClaims(),
    supabase.rpc("is_admin"),
  ]);
  if (!post) notFound();

  // Only which buttons to show: RLS decides what is allowed (docs/adr/0002).
  const me = claims?.claims.sub;
  const mine = post.author_id === me;

  return (
    <>
      <article className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-primary">{CATEGORY_LABEL[post.category]}</p>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{post.title}</h1>
          <p className="text-sm">
            <UserLink userId={post.author_id} name={post.profile?.name ?? "알 수 없음"} />{" "}
            <span className="text-muted-foreground">
              · {formatKst(post.created_at)}
              {edited(post) && " (고침)"}
            </span>
          </p>
        </div>
        <p className="whitespace-pre-wrap break-words">{post.body}</p>
        <div className="flex flex-wrap items-start gap-2">
          {mine && (
            <Button size="xs" variant="ghost" nativeButton={false} render={<Link href={`/board/${post.id}/edit`} />}>
              고치기
            </Button>
          )}
          {(mine || isAdmin) && <DeleteButton target={{ post_id: post.id }} />}
          {!mine && <ReportButton target={{ post_id: post.id }} />}
        </div>
      </article>

      <section className="flex flex-col gap-4 border-t pt-6">
        <h2 className="text-lg font-semibold">
          댓글 <span className="text-muted-foreground">{post.post_comment.length}</span>
        </h2>
        {post.post_comment.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border">
            {post.post_comment.map((c) => (
              <CommentItem
                key={c.id}
                comment={{
                  id: c.id,
                  body: c.body,
                  authorId: c.author_id,
                  authorName: c.profile?.name ?? "알 수 없음",
                  writtenAt: formatKst(c.created_at),
                  edited: edited(c),
                }}
                canEdit={c.author_id === me}
                canDelete={c.author_id === me || Boolean(isAdmin)}
              />
            ))}
          </ul>
        )}
        <CommentForm postId={post.id} />
      </section>
    </>
  );
}
