import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET } from "@/lib/submissions/storage";
import { formatKst } from "@/lib/time";
import { deleteSubmission } from "./submission-actions";
import { SubmitFileForm } from "./submit-file-form";

type Props = { assignmentId: string; studentId: string; open: boolean };

const DOWNLOAD_LINK_SECONDS = 60 * 5;

// The signed-in 수강생's own submission for one assignment.
export async function MySubmission({ assignmentId, studentId, open }: Props) {
  const supabase = await createServerSupabase();
  const { data: submission } = await supabase
    .from("submission")
    .select("submitted_at, submission_file(path, size, storage_path)")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  const files = submission?.submission_file ?? [];
  const { data: signed } = files.length
    ? await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrls(
        files.map((f) => f.storage_path),
        DOWNLOAD_LINK_SECONDS,
      )
    : { data: [] };
  // Download under the submitted file name (the object name is just an index).
  // supabase-js's `download` option encodes the name twice, so Korean names come out garbled.
  const links = files.map((f, i) => {
    const url = signed?.[i]?.signedUrl;
    return url && `${url}&download=${encodeURIComponent(f.path.split("/").pop() ?? f.path)}`;
  });

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">내 제출물</h2>

      {submission ? (
        <>
          <p className="text-sm">
            <span className="font-medium">제출함</span>{" "}
            <span className="text-muted-foreground">· {formatKst(submission.submitted_at)}</span>
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((file, i) => (
              <li key={file.storage_path}>
                {links[i] ? (
                  <a href={links[i]} className="underline">
                    {file.path}
                  </a>
                ) : (
                  file.path
                )}{" "}
                <span className="text-muted-foreground">({formatBytes(file.size)})</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">아직 제출하지 않았어요.</p>
      )}

      {open ? (
        <>
          <SubmitFileForm assignmentId={assignmentId} studentId={studentId} resubmit={Boolean(submission)} />
          {submission && (
            <form action={deleteSubmission}>
              <input type="hidden" name="assignment_id" value={assignmentId} />
              <Button type="submit" size="sm" variant="outline">
                제출 취소 (삭제)
              </Button>
            </form>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">마감이 지나서 제출하거나 고칠 수 없어요.</p>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
