import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { decodeText } from "@/lib/highlight";
import {
  changeOf,
  countChanges,
  diffText,
  pairFiles,
  sameBytes,
  type DiffHunk,
  type FileChange,
  type VersionFile,
} from "@/lib/submissions/compare";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import { createServerSupabase, type ServerSupabase } from "@/lib/supabase/server";
import { formatKst } from "@/lib/time";
import { cn } from "@/lib/utils";
import { submissionHref } from "../../submission-href";

type Route = "/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]/compare";
type Params = Awaited<PageProps<Route>["params"]>;

/** Text files bigger than this are compared as bytes only (바뀜/그대로), like binary files. */
const DIFF_MAX_BYTES = 1024 * 1024;
/** The 지금 제출물 in the version pickers. */
const CURRENT = "current";

type StoredFile = VersionFile & { storage_path: string };
type Version = { key: string; submittedAt: string; files: StoredFile[] };

export default function ComparePage({ params, searchParams }: PageProps<Route>) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">불러오는 중…</p>}>
        {Promise.all([params, searchParams]).then(([p, { from, to }]) => (
          <CompareView {...p} from={typeof from === "string" ? from : undefined} to={typeof to === "string" ? to : undefined} />
        ))}
      </Suspense>
    </main>
  );
}

async function CompareView({ courseId, assignmentId, submissionId, from, to }: Params & { from?: string; to?: string }) {
  const supabase = await createServerSupabase();
  // RLS returns the 제출물 and its 제출 이력 only to those who may see the 제출물 (docs/adr/0002).
  const { data: submission } = await supabase
    .from("submission")
    .select(
      "submitted_at, assignment!inner(title, course_id), submission_file(path, size, storage_path, kind), submission_history(id, submitted_at, submission_history_file(path, size, storage_path, kind))",
    )
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("assignment.course_id", courseId)
    .maybeSingle();

  const backLink = (
    <Link href={submissionHref(courseId, assignmentId, submissionId)} className="text-sm text-muted-foreground underline hover:text-primary">
      ← 제출물로
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

  // Newest first: the 지금 제출물, then the 제출 이력.
  const versions: Version[] = [
    { key: CURRENT, submittedAt: submission.submitted_at, files: submission.submission_file },
    ...submission.submission_history
      .toSorted((a, b) => b.submitted_at.localeCompare(a.submitted_at))
      .map((h) => ({ key: h.id, submittedAt: h.submitted_at, files: h.submission_history_file })),
  ];

  if (versions.length < 2) {
    return (
      <>
        {backLink}
        <h1 className="text-2xl font-semibold">제출 이력 비교</h1>
        <p className="text-sm text-muted-foreground">비교할 이전 제출물이 없어요. 재제출하면 제출 이력이 남아요.</p>
      </>
    );
  }

  const toIndex = Math.max(0, versions.findIndex((v) => v.key === (to ?? CURRENT)));
  const fromFound = versions.findIndex((v) => v.key === from);
  // By default, the version just before the one being compared to.
  const fromIndex = fromFound >= 0 ? fromFound : Math.min(toIndex + 1, versions.length - 1);
  const before = versions[fromIndex];
  const after = versions[toIndex];

  const compared = await compareVersions(supabase, before, after);
  const shown = compared.filter((f) => f.change !== "unchanged");
  const unchanged = compared.filter((f) => f.change === "unchanged");

  return (
    <>
      {backLink}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">제출 이력 비교</h1>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <VersionPicker name="from" label="이전" versions={versions} value={before.key} />
          <span className="pb-2 text-muted-foreground">→</span>
          <VersionPicker name="to" label="이후" versions={versions} value={after.key} />
          <Button type="submit" size="sm" variant="outline">
            비교
          </Button>
        </form>
        {fromIndex < toIndex && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">이전 칸에 더 나중에 낸 제출물을 골랐어요. 더해진 줄과 빠진 줄이 거꾸로 보여요.</p>
        )}
        <p className="text-sm text-muted-foreground">
          바뀐 파일 {shown.length}개 · 그대로인 파일 {unchanged.length}개
        </p>
      </div>

      {before.key === after.key ? (
        <p className="text-sm text-muted-foreground">같은 제출물을 골랐어요. 서로 다른 두 제출물을 골라 주세요.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">두 제출물의 파일이 모두 같아요.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((f) => (
            <li key={f.path}>
              <FileDiff file={f} />
            </li>
          ))}
        </ul>
      )}

      {unchanged.length > 0 && before.key !== after.key && (
        <details className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">그대로인 파일 {unchanged.length}개</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {unchanged.map((f) => (
              <li key={f.path} className="font-mono text-xs">
                {f.path}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function VersionPicker({ name, label, versions, value }: { name: string; label: string; versions: Version[]; value: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value} className="h-8 rounded-lg border bg-background px-2">
        {versions.map((v) => (
          <option key={v.key} value={v.key}>
            {v.key === CURRENT ? `지금 제출물 (${formatKst(v.submittedAt)})` : formatKst(v.submittedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

type ComparedFile = {
  path: string;
  change: FileChange;
  /** Line differences, when both sides are text files small enough to compare by line. */
  hunks: DiffHunk[] | null;
  /** Why there are no line differences for a changed file. */
  note: "binary" | "large" | "newline" | null;
};

async function compareVersions(supabase: ServerSupabase, before: Version, after: Version): Promise<ComparedFile[]> {
  const storage = supabase.storage.from(SUBMISSION_BUCKET);
  const bytesOf = async (file: StoredFile) => {
    const { data } = await storage.download(file.storage_path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };

  return Promise.all(
    pairFiles(before.files, after.files).map(async (pair): Promise<ComparedFile> => {
      const b = pair.before as StoredFile | null;
      const a = pair.after as StoredFile | null;
      const bothText = b?.kind === "text" && a?.kind === "text";
      const small = (b?.size ?? 0) <= DIFF_MAX_BYTES && (a?.size ?? 0) <= DIFF_MAX_BYTES;

      if (!b || !a) return { path: pair.path, change: changeOf(pair, () => false), hunks: null, note: null };
      // Different sizes are a change without reading, unless the lines are wanted.
      if (b.size !== a.size && !(bothText && small)) {
        return { path: pair.path, change: "changed", hunks: null, note: bothText ? "large" : "binary" };
      }

      const [beforeBytes, afterBytes] = await Promise.all([bytesOf(b), bytesOf(a)]);
      // Unreadable files are shown as changed rather than silently as the same.
      const same = beforeBytes !== null && afterBytes !== null && sameBytes(beforeBytes, afterBytes);
      const change = changeOf(pair, () => same);
      if (change === "unchanged") return { path: pair.path, change, hunks: null, note: null };
      if (!bothText || !beforeBytes || !afterBytes) return { path: pair.path, change, hunks: null, note: "binary" };
      if (!small) return { path: pair.path, change, hunks: null, note: "large" };

      const hunks = diffText(decodeText(beforeBytes.buffer as ArrayBuffer), decodeText(afterBytes.buffer as ArrayBuffer));
      return { path: pair.path, change, hunks, note: hunks.length === 0 ? "newline" : null };
    }),
  );
}

const CHANGE_LABEL: Record<FileChange, { label: string; className: string }> = {
  added: { label: "새로 생김", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  removed: { label: "지워짐", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  changed: { label: "바뀜", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" },
  unchanged: { label: "그대로", className: "bg-muted text-muted-foreground" },
};

const NOTE: Record<NonNullable<ComparedFile["note"]>, string> = {
  binary: "바이너리 파일이라 줄 단위로 비교하지 않아요.",
  large: "파일이 커서 줄 단위 비교를 건너뛰었어요.",
  newline: "줄바꿈 방식만 바뀌었어요.",
};

function FileDiff({ file }: { file: ComparedFile }) {
  const counts = file.hunks ? countChanges(file.hunks) : null;
  const status = CHANGE_LABEL[file.change];
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-3">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>{status.label}</span>
        <span className="font-mono font-medium break-all">{file.path}</span>
        {counts && (counts.added > 0 || counts.removed > 0) && (
          <span className="text-xs">
            <span className="text-emerald-700 dark:text-emerald-300">+{counts.added}</span>{" "}
            <span className="text-red-700 dark:text-red-300">−{counts.removed}</span>
          </span>
        )}
      </header>
      {file.note && <p className="text-sm text-muted-foreground">{NOTE[file.note]}</p>}
      {file.hunks && file.hunks.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {file.hunks.map((hunk, i) => (
                <HunkRows key={i} hunk={hunk} first={i === 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HunkRows({ hunk, first }: { hunk: DiffHunk; first: boolean }) {
  return (
    <>
      {!first && (
        <tr className="bg-muted/60 text-muted-foreground">
          <td colSpan={4} className="px-2 py-0.5">
            ⋯
          </td>
        </tr>
      )}
      {hunk.lines.map((line, i) => {
        const oldNo = line.type === "added" ? "" : line.oldNo;
        const newNo = line.type === "removed" ? "" : line.newNo;
        const sign = line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
        return (
          <tr
            key={i}
            className={cn(
              line.type === "added" && "bg-emerald-50 dark:bg-emerald-950/40",
              line.type === "removed" && "bg-red-50 dark:bg-red-950/40",
            )}
          >
            <td className="w-10 px-2 text-right text-muted-foreground select-none">{oldNo}</td>
            <td className="w-10 px-2 text-right text-muted-foreground select-none">{newNo}</td>
            <td className="w-4 select-none">{sign}</td>
            <td className="px-1 whitespace-pre">{line.text}</td>
          </tr>
        );
      })}
    </>
  );
}
