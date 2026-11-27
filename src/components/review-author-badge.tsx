import { cn } from "@/lib/utils";
import { REVIEW_AUTHOR_ROLE_LABEL, type ReviewAuthorRole } from "@/lib/reviews/author-role";

const STYLE: Record<ReviewAuthorRole, string> = {
  professor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  assistant: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  student: "bg-muted text-muted-foreground",
};

/** 교수 / 조교 / 학생 badge next to a 리뷰 author's name. Nothing for authors outside the 과목. */
export function ReviewAuthorBadge({ role }: { role: ReviewAuthorRole | null }) {
  if (!role) return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STYLE[role])}>
      {REVIEW_AUTHOR_ROLE_LABEL[role]}
    </span>
  );
}
