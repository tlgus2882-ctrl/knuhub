/** "지각" on a 제출물 handed in after the 마감 (during the 지각 제출 period). */
export function LateBadge({ submittedAt, dueAt }: { submittedAt: string; dueAt: string }) {
  if (Date.parse(submittedAt) <= Date.parse(dueAt)) return null;
  return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">지각</span>;
}
