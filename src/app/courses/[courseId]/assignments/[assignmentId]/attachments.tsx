import { ASSIGNMENT_FILE_BUCKET } from "@/lib/assignments/storage";
import { formatBytes } from "@/lib/format-bytes";
import { downloadUrl } from "@/lib/storage-download";
import { createServerSupabase } from "@/lib/supabase/server";
import { AttachmentUpload } from "./attachment-upload";
import { DetachButton } from "./detach-button";

const DOWNLOAD_LINK_SECONDS = 60 * 5;

type Props = { assignmentId: string; canEdit: boolean };

// 과제 첨부파일. RLS lists them only to the course's people (docs/adr/0002), so
// others see nothing here; the professor and assistants can also attach and detach.
export async function Attachments({ assignmentId, canEdit }: Props) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("assignment_file")
    .select("id, name, size, storage_path")
    .eq("assignment_id", assignmentId)
    .order("created_at");
  const files = data ?? [];
  if (!files.length && !canEdit) return null;

  const { data: signed } = files.length
    ? await supabase.storage.from(ASSIGNMENT_FILE_BUCKET).createSignedUrls(
        files.map((f) => f.storage_path),
        DOWNLOAD_LINK_SECONDS,
      )
    : { data: [] };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">첨부파일</h2>
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((file, i) => {
            const url = signed?.[i]?.signedUrl;
            const href = url && downloadUrl(url, file.name);
            return (
              <li key={file.id} className="flex items-center gap-2">
                {href ? (
                  <a href={href} className="text-primary underline">
                    {file.name}
                  </a>
                ) : (
                  file.name
                )}
                <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                {canEdit && <DetachButton fileId={file.id} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">첨부파일이 없어요.</p>
      )}
      {canEdit && <AttachmentUpload assignmentId={assignmentId} />}
    </section>
  );
}
