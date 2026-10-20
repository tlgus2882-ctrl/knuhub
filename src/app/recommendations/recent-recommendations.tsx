import { Award } from "lucide-react";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { submissionHref } from "../courses/[courseId]/assignments/[assignmentId]/submissions/submission-href";

/** 제출물 that got a 교수 추천 in the last week, of those the viewer may see (recent_recommendations()). */
export async function RecentRecommendations() {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return null;
  const { data: rows } = await supabase.rpc("recent_recommendations");
  if (!rows?.length) return null;

  return (
    <section aria-labelledby="recent-recommendations" className="flex flex-col gap-2 rounded-xl border bg-background p-3">
      <h2 id="recent-recommendations" className="flex items-center gap-1 text-sm font-semibold">
        <Award className="size-4 text-amber-600" aria-hidden />
        이번 주 교수 추천
      </h2>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.submission_id}>
            <Link
              href={submissionHref(row.course_id, row.assignment_id, row.submission_id)}
              className="flex flex-col rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="font-medium">{row.student_name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {row.course_name} · {row.assignment_title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
