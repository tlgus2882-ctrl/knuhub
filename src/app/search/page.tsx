import Link from "next/link";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { submissionHref } from "../courses/[courseId]/assignments/[assignmentId]/submissions/submission-href";
import { SearchBox } from "./search-box";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← 처음으로
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">검색</h1>
      <Suspense fallback={<SearchBox />}>
        {searchParams.then(({ q }) => {
          const query = typeof q === "string" ? q.trim() : "";
          return (
            <>
              <SearchBox defaultValue={query} />
              {query && <Results query={query} />}
            </>
          );
        })}
      </Suspense>
    </main>
  );
}

const GROUP_TITLE = { course: "과목", assignment: "과제", submission: "제출물" } as const;
type Kind = keyof typeof GROUP_TITLE;

// search() runs as the signed-in user, so RLS already left out what they may not see.
async function Results({ query }: { query: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("search", { query });

  if (error) {
    console.error("search failed", error.message);
    return <p className="text-sm text-destructive">검색하지 못했어요. 잠시 뒤에 다시 해 주세요.</p>;
  }
  if (!data.length) return <p className="text-sm text-muted-foreground">“{query}”에 맞는 결과가 없어요.</p>;

  const groups = Map.groupBy(data, (row) => row.kind as Kind);

  return (
    <div className="flex flex-col gap-6">
      {(Object.keys(GROUP_TITLE) as Kind[]).map((kind) => {
        const rows = groups.get(kind);
        if (!rows) return null;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">
              {GROUP_TITLE[kind]} <span className="text-muted-foreground">{rows.length}</span>
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {rows.map((row) => (
                <li key={`${kind}:${row.submission_id ?? row.assignment_id ?? row.course_id}`}>
                  <Link href={hrefOf(kind, row)} className="flex flex-col p-3 hover:bg-muted">
                    <span className="font-medium">{row.title}</span>
                    <span className="text-sm text-muted-foreground">{row.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function hrefOf(kind: Kind, row: { course_id: string; assignment_id: string; submission_id: string }) {
  if (kind === "course") return `/courses/${row.course_id}`;
  if (kind === "assignment") return `/courses/${row.course_id}/assignments/${row.assignment_id}`;
  return submissionHref(row.course_id, row.assignment_id, row.submission_id);
}
