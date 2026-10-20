import { Award } from "lucide-react";

/** The 교수 추천 mark on a 제출물. */
export function RecommendedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      <Award className="size-3.5" aria-hidden />
      교수 추천
    </span>
  );
}
