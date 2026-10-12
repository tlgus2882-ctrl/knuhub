import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { ReviewForm } from "./review-form";
import { ReviewItem } from "./review-item";

// Reviews of one 제출물. Only rendered for viewers who may see the 제출물, so they
// may also write one; RLS decides what is listed and allowed (docs/adr/0002).
export async function Reviews({ submissionId }: { submissionId: string }) {
  const supabase = await createServerSupabase();
  // can_edit / can_delete come from the same DB functions the RLS policies use.
  const { data: reviews } = await supabase
    .from("review")
    .select("id, body, created_at, updated_at, can_edit, can_delete, profile(name)")
    .eq("submission_id", submissionId)
    .order("created_at");
  const rows = reviews ?? [];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        리뷰 <span className="text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((r) => (
            <ReviewItem
              key={r.id}
              review={{
                id: r.id,
                body: r.body,
                authorName: r.profile?.name ?? "알 수 없음",
                writtenAt: formatKst(r.created_at),
                edited: Date.parse(r.updated_at) > Date.parse(r.created_at),
              }}
              canEdit={Boolean(r.can_edit)}
              canDelete={Boolean(r.can_delete)}
            />
          ))}
        </ul>
      )}
      <ReviewForm submissionId={submissionId} />
    </section>
  );
}
