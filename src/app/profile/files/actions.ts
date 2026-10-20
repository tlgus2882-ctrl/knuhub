"use server";

import { refresh } from "next/cache";
import { PROFILE_FILE_BUCKET } from "@/lib/profile-files/storage";
import { createServerSupabase } from "@/lib/supabase/server";

// Raised by add_profile_file() (supabase/migrations/*_profile_files.sql).
const PROFILE_FILE_ERRORS: Record<string, string> = {
  KH015: "프로필 파일 합계 한도를 넘어요. 다른 파일을 지운 뒤 올려 주세요.",
  KH016: "올린 파일을 찾지 못했어요. 다시 골라 주세요.",
};

// The browser has already uploaded the file to my folder (docs/adr/0002); this makes it a 프로필 파일.
// If it fails, the browser removes the object it just uploaded.
export async function addProfileFile(storagePath: string, name: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("add_profile_file", { storage_path: storagePath, file_name: name });
  if (error) {
    console.error("addProfileFile failed", error.message);
    return { error: PROFILE_FILE_ERRORS[error.code] ?? "올리지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }
  refresh();
  return { error: null };
}

export async function deleteProfileFile(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("profile_file")
    .delete()
    .eq("id", String(form.get("file_id")))
    .select("storage_path");
  if (error || !data?.length) {
    if (error) console.error("deleteProfileFile failed", error.message);
    return { error: "내 프로필 파일만 지울 수 있어요." };
  }
  const { error: removeError } = await supabase.storage.from(PROFILE_FILE_BUCKET).remove([data[0].storage_path]);
  if (removeError) console.error("deleteProfileFile: removing the file failed", removeError.message);
  refresh();
  return { error: null };
}
