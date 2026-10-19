import Link from "next/link";
import { Suspense } from "react";
import { formatBytes } from "@/lib/format-bytes";
import { downloadUrl } from "@/lib/storage-download";
import { decodeText, highlight } from "@/lib/highlight";
import { buildFileTree } from "@/lib/submissions/file-tree";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import type { Tables } from "@/lib/supabase/database.types";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { submissionFileHrefs, submissionHref } from "../submission-href";
import { AuthorCard } from "@/components/author-card";
import { FileTree } from "./file-tree";
import { Reviews } from "./reviews";

type Route = "/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]";
type Params = Awaited<PageProps<Route>["params"]>;

type ViewedFile = Pick<Tables<"submission_file">, "path" | "size" | "storage_path" | "kind">;

/** Bigger text files are offered as a download instead of being highlighted. */
const HIGHLIGHT_MAX_BYTES = 1024 * 1024;
const DOWNLOAD_LINK_SECONDS = 60 * 5;

export default function SubmissionPage({ params, searchParams }: PageProps<Route>) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {Promise.all([params, searchParams]).then(([p, { file, history }]) => (
          <SubmissionView
            {...p}
            file={typeof file === "string" ? file : undefined}
            historyId={typeof history === "string" ? history : undefined}
          />
        ))}
      </Suspense>
    </main>
  );
}

async function SubmissionView({
  courseId,
  assignmentId,
  submissionId,
  file,
  historyId,
}: Params & { file?: string; historyId?: string }) {
  const supabase = await createServerSupabase();
  // RLS returns the 제출물 only to those who may see it (docs/adr/0002).
  const { data: submission } = await supabase
    .from("submission")
    .select(
      "submitted_at, student_id, profile(name, student_number), assignment!inner(title, course_id), submission_file(path, size, storage_path, kind), submission_history(id, submitted_at, submission_history_file(path, size, storage_path, kind))",
    )
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("assignment.course_id", courseId)
    .maybeSingle();

  const backLink = (
    <Link href={`/courses/${courseId}/assignments/${assignmentId}`} className="text-sm text-muted-foreground underline hover:text-primary">
      ← {submission?.assignment.title ?? "과제로"}
    </Link>
  );

  if (!submission) {
    return (
      <>
        {backLink}
        <p className="text-sm text-muted-foreground">볼 수 없거나 없는 제출물이에요.</p>
      </>
    );
  }

  // 제출 이력, newest first. RLS shows it to whoever may see the 제출물 itself.
  const history = submission.submission_history.toSorted((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const viewed = history.find((h) => h.id === historyId);
  const files = viewed ? viewed.submission_history_file : submission.submission_file;
  const selected =
    files.find((f) => f.path === file) ?? files.find((f) => f.kind === "text") ?? files[0];

  return (
    <>
      {backLink}
      <div className="flex flex-col gap-2">
        <AuthorCard
          authorId={submission.student_id}
          name={submission.profile?.name ?? "알 수 없음"}
          studentNumber={submission.profile?.student_number ?? null}
        />
        <p className="text-sm text-muted-foreground">
          제출 {formatKst(viewed?.submitted_at ?? submission.submitted_at)} · 파일 {files.length}개
        </p>
        {history.length > 0 && (
          <nav aria-label="제출 이력" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">제출 이력</span>
            {[{ id: undefined, submitted_at: submission.submitted_at }, ...history].map((h) => (
              <Link
                key={h.id ?? "current"}
                href={submissionHref(courseId, assignmentId, submissionId, undefined, h.id)}
                aria-current={h.id === viewed?.id ? "page" : undefined}
                className="rounded-full border px-3 py-1 hover:bg-muted aria-[current=page]:border-primary aria-[current=page]:text-primary"
              >
                {h.id ? formatKst(h.submitted_at) : "지금 제출물"}
              </Link>
            ))}
          </nav>
        )}
        {viewed && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            이전 제출물을 보고 있어요. 리뷰는 지금 제출물에 남아요.
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <nav aria-label="파일 트리" className="max-h-[70vh] overflow-y-auto rounded-xl border p-2">
          <FileTree
            nodes={buildFileTree(files.map((f) => f.path))}
            selected={selected?.path}
            hrefFor={submissionFileHrefs(courseId, assignmentId, submissionId, viewed?.id)}
          />
        </nav>
        {selected ? (
          <FileContent supabase={supabase} file={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">파일이 없는 제출물이에요.</p>
        )}
      </div>

      <Reviews submissionId={submissionId} />
    </>
  );
}

const NO_PREVIEW = {
  binary: "바이너리 파일이라 미리 볼 수 없어요. 내려받아서 확인해 주세요.",
  large: "파일이 커서 미리 보기를 건너뛰었어요. 내려받아서 확인해 주세요.",
  failed: "파일을 불러오지 못했어요.",
};

async function FileContent({ supabase, file }: { supabase: ServerSupabase; file: ViewedFile }) {
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const { data: signed } = await storage.createSignedUrl(file.storage_path, DOWNLOAD_LINK_SECONDS);
  const download = signed && downloadUrl(signed.signedUrl, file.path.split("/").pop()!);

  let html: string | null = null;
  let noPreview: keyof typeof NO_PREVIEW | null = null;
  if (file.kind === "binary") noPreview = "binary";
  else if (file.size > HIGHLIGHT_MAX_BYTES) noPreview = "large";
  else {
    const { data } = await storage.download(file.storage_path);
    if (data) html = await highlight(decodeText(await data.arrayBuffer()), file.path);
    else noPreview = "failed";
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{file.path}</span>
        <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
          {formatBytes(file.size)}
          {download && (
            <a href={download} className="text-primary underline">
              내려받기
            </a>
          )}
        </span>
      </header>
      {html ? (
        <div className="code-view" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        noPreview && <p className="rounded-lg border p-6 text-sm text-muted-foreground">{NO_PREVIEW[noPreview]}</p>
      )}
    </section>
  );
}
