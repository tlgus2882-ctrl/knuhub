import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatKst, timeLeft } from "@/lib/time";

export async function AssignmentList({ courseId, canPost }: { courseId: string; canPost: boolean }) {
  const supabase = await createServerSupabase();
  const { data: assignments } = await supabase
    .from("assignment")
    .select("id, title, due_at, published")
    .eq("course_id", courseId)
    .order("due_at", { ascending: true });
  await connection();
  const now = new Date();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">과제</h2>
        {canPost && (
          <Button size="sm" nativeButton={false} render={<Link href={`/courses/${courseId}/assignments/new`} />}>
            과제 만들기
          </Button>
        )}
      </div>
      {!assignments?.length ? (
        <p className="text-sm text-muted-foreground">아직 공지된 과제가 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <Link
                href={`/courses/${courseId}/assignments/${assignment.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
              >
                <span className="font-medium">
                  {assignment.title}
                  {/* RLS shows unpublished ones only to the professor and assistants. */}
                  {!assignment.published && (
                    <span className="ml-2 rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      비공개
                    </span>
                  )}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {formatKst(assignment.due_at)}
                  <br />
                  {timeLeft(assignment.due_at, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
