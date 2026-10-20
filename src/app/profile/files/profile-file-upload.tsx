"use client";

import { useState, useTransition } from "react";
import { PROFILE_FILE_BUCKET, PROFILE_FILE_MAX_BYTES, profileFileObjectName } from "@/lib/profile-files/storage";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { addProfileFile } from "./actions";

/** Uploads straight to my Storage folder (docs/adr/0002), then registers each file. */
export function ProfileFileUpload({ ownerId }: { ownerId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(files: File[]) {
    const tooLarge = files.filter((file) => file.size > PROFILE_FILE_MAX_BYTES);
    if (tooLarge.length) {
      return setError(`파일은 하나에 ${PROFILE_FILE_MAX_BYTES / 1024 / 1024}MB까지예요: ${tooLarge.map((f) => f.name).join(", ")}`);
    }
    startTransition(async () => {
      setError(null);
      const storage = createBrowserSupabase().storage.from(PROFILE_FILE_BUCKET);
      for (const file of files) {
        const storagePath = profileFileObjectName(ownerId, crypto.randomUUID());
        const { error: uploadError } = await storage.upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) return setError(`${file.name}: 올리지 못했어요. 합계 한도를 넘었거나 로그인이 끝났을 수 있어요.`);
        let result: { error: string | null };
        try {
          result = await addProfileFile(storagePath, file.name);
        } catch {
          result = { error: "올리지 못했어요. 잠시 뒤에 다시 해 주세요." };
        }
        if (result.error) {
          await storage.remove([storagePath]);
          return setError(`${file.name}: ${result.error}`);
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="cursor-pointer self-start rounded-lg border px-3 py-1.5 text-sm hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
        {pending ? "올리는 중…" : "파일 올리기"}
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const picked = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (picked.length) upload(picked);
          }}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
