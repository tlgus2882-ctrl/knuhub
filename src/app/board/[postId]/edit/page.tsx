import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { PostForm } from "../../post-form";

export default function EditPostPage({ params }: PageProps<"/board/[postId]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">글 고치기</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {params.then(({ postId }) => (
          <EditPost postId={postId} />
        ))}
      </Suspense>
    </main>
  );
}

async function EditPost({ postId }: { postId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: post }, { data: claims }] = await Promise.all([
    supabase.from("post").select("id, category, title, body, author_id").eq("id", postId).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  // Someone else's post: the save would be refused by RLS anyway, so don't offer the form.
  if (!post || post.author_id !== claims?.claims.sub) notFound();

  return <PostForm post={post} />;
}
