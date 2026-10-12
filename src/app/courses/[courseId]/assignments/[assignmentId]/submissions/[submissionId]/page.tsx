import Link from "next/link";
import { Suspense } from "react";
import { formatBytes } from "@/lib/format-bytes";
import { highlight } from "@/lib/highlight";
import { buildFileTree } from "@/lib/submissions/file-tree";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { signDownloadLinks, type SubmissionFile } from "../../submission-files";
import { submissionHref } from "../submission-href";
import { AuthorCard } from "./author-card";
import { FileTree } from "./file-tree";

type Route = "/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]";
type Params = Awaited<PageProps<Route>["params"]>;

/** Bigger text files are offered as a download instead of being highlighted. */
const HIGHLIGHT_MAX_BYTES = 1024 * 1024;

export default function SubmissionPage({ params, searchParams }: PageProps<Route>) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {Promise.all([params, searchParams]).then(([p, { file }]) => (
          <SubmissionView {...p} file={typeof file === "string" ? file : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function SubmissionView({ courseId, assignmentId, submissionId, file }: Params & { file?: string }) {
  const supabase = await createServerSupabase();
  // RLS returns the 제출물 only to those who may see it (docs/adr/0002).
  const { data: submission } = await supabase
    .from("submission")
    .select(
      "submitted_at, profile(name, student_number), assignment!inner(title, course_id), submission_file(path, size, storage_path, kind)",
    )
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("assignment.course_id", courseId)
    .maybeSingle();

  const back = (
    <Link href={`/courses/${courseId}/assignments/${assignmentId}`} className="text-sm text-muted-foreground underline">
      ← {submission?.assignment.title ?? "과제로"}
    </Link>
  );

  if (!submission) {
    return (
      <>
        {back}
        <p className="text-sm text-muted-foreground">
          볼 수 없는 제출물이에요. 마감 전이거나 공개 범위 밖이면 작성자와 담당 교수·조교만 볼 수 있어요.
        </p>
      </>
    );
  }

  const files = submission.submission_file;
  const selected =
    files.find((f) => f.path === file) ?? files.find((f) => f.kind === "text") ?? files[0];

  return (
    <>
      {back}
      <div className="flex flex-col gap-2">
        <AuthorCard name={submission.profile?.name ?? "알 수 없음"} studentNumber={submission.profile?.student_number ?? null} />
        <p className="text-sm text-muted-foreground">
          제출 {formatKst(submission.submitted_at)} · 파일 {files.length}개
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <nav aria-label="파일 트리" className="max-h-[70vh] overflow-y-auto rounded-xl border p-2">
          <FileTree
            nodes={buildFileTree(files.map((f) => f.path))}
            selected={selected?.path}
            hrefFor={(path) => submissionHref(courseId, assignmentId, submissionId, path)}
          />
        </nav>
        {selected && <FileContent supabase={supabase} file={selected} />}
      </div>
    </>
  );
}

async function FileContent({ supabase, file }: { supabase: ServerSupabase; file: SubmissionFile }) {
  const links = await signDownloadLinks(supabase, [file]);
  const download = links.get(file.storage_path);
  const showCode = file.kind === "text" && file.size <= HIGHLIGHT_MAX_BYTES;

  let html: string | null = null;
  if (showCode) {
    const { data } = await supabase.storage.from(SUBMISSION_BUCKET).download(file.storage_path);
    if (data) html = await highlight(await data.text(), file.path);
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{file.path}</span>
        <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
          {formatBytes(file.size)}
          {download && (
            <a href={download} className="underline">
              내려받기
            </a>
          )}
        </span>
      </header>
      {html ? (
        <div className="code-view" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          {file.kind === "binary"
            ? "바이너리 파일이라 미리 볼 수 없어요. 내려받아서 확인해 주세요."
            : showCode
              ? "파일을 불러오지 못했어요."
              : "파일이 커서 미리 보기를 건너뛰었어요. 내려받아서 확인해 주세요."}
        </p>
      )}
    </section>
  );
}
