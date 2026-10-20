import { formatBytes } from "@/lib/format-bytes";
import { PROFILE_FILE_BUCKET, PROFILE_FILE_MAX_BYTES, PROFILE_FILES_TOTAL_BYTES } from "@/lib/profile-files/storage";
import { downloadUrl } from "@/lib/storage-download";
import { createServerSupabase } from "@/lib/supabase/server";
import { DeleteProfileFileButton } from "./delete-profile-file-button";
import { ProfileFileUpload } from "./profile-file-upload";

const DOWNLOAD_LINK_SECONDS = 60 * 5;
const MB = 1024 * 1024;

/** Someone's 프로필 파일: anyone signed in sees and downloads them; `editable` on my own profile. */
export async function ProfileFiles({ ownerId, editable }: { ownerId: string; editable: boolean }) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profile_file")
    .select("id, name, size, storage_path")
    .eq("owner_id", ownerId)
    .order("created_at");
  const files = data ?? [];
  if (!files.length && !editable) return null;

  const { data: signed } = files.length
    ? await supabase.storage.from(PROFILE_FILE_BUCKET).createSignedUrls(
        files.map((f) => f.storage_path),
        DOWNLOAD_LINK_SECONDS,
      )
    : { data: [] };
  const used = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">프로필 파일</h2>
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((file, i) => {
            const url = signed?.[i]?.signedUrl;
            return (
              <li key={file.id} className="flex flex-wrap items-center gap-2">
                {url ? (
                  <a href={downloadUrl(url, file.name)} className="break-all text-primary underline">
                    {file.name}
                  </a>
                ) : (
                  file.name
                )}
                <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                {editable && <DeleteProfileFileButton fileId={file.id} name={file.name} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">아직 올린 파일이 없어요. 포트폴리오, 이력서 같은 파일을 올려 보세요.</p>
      )}
      {editable && (
        <>
          <p className="text-xs text-muted-foreground">
            로그인한 사용자 누구나 내려받을 수 있어요. 파일 하나에 {PROFILE_FILE_MAX_BYTES / MB}MB, 합쳐서 {PROFILE_FILES_TOTAL_BYTES / MB}MB까지 · 지금{" "}
            {formatBytes(used)}
          </p>
          <ProfileFileUpload ownerId={ownerId} />
        </>
      )}
    </section>
  );
}
