import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Question } from "@/lib/team-draw/form-teams";
import { toKstInputValue } from "@/lib/time";
import { PostForm } from "../../post-form";
import { TeamDrawForm } from "../../team-draw/team-draw-form";

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
    supabase
      .from("post")
      .select("id, course_id, category, is_notice, title, body, author_id, team_draw(mode, team_size, criteria, questions, survey_due_at, survey_response(count))")
      .eq("id", postId)
      .maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  // Someone else's post: the save would be refused by RLS anyway, so don't offer the form.
  if (!post || post.author_id !== claims?.claims.sub) notFound();

  if (post.team_draw) {
    const draw = post.team_draw;
    return (
      <TeamDrawForm
        draw={{
          postId: post.id,
          title: post.title,
          body: post.body,
          mode: draw.mode,
          teamSize: draw.team_size,
          criteria: draw.criteria,
          questions: draw.questions as Question[],
          dueInput: draw.survey_due_at ? toKstInputValue(draw.survey_due_at) : "",
          questionsLocked: (draw.survey_response[0]?.count ?? 0) > 0,
        }}
      />
    );
  }

  const { data: canNotice } = post.course_id
    ? await supabase.rpc("is_professor_or_assistant", { target_course: post.course_id })
    : { data: false };
  return <PostForm post={post} canNotice={canNotice === true} />;
}
