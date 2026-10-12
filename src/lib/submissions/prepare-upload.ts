// 업로드 준비 (spec module 6): turns the files of a zip, a dropped folder or a
// file picker into the list to upload. Pure, so it runs in the browser and in tests.
import { unzipSync } from "fflate";
import { SUBMISSION_MAX_BYTES } from "./storage";

export type UploadEntry = { path: string; data: Uint8Array };
/** text: shown in the code viewer; binary: download only. */
export type FileKind = "text" | "binary";
export type PreparedFile = UploadEntry & { kind: FileKind };

export type PreparedUpload =
  | { ok: true; files: PreparedFile[]; totalBytes: number }
  | { ok: false; reason: "too-large" | "empty"; totalBytes: number };

/** Folders and files that are never part of a 제출물. Matched against any path segment. */
const EXCLUDED_NAMES = new Set(["node_modules", ".git", "__MACOSX", ".DS_Store"]);

export function prepareUpload(entries: UploadEntry[]): PreparedUpload {
  const files = entries
    .map((entry) => ({ ...entry, path: normalizePath(entry.path) }))
    .filter((entry) => entry.path !== "" && !isExcluded(entry.path));
  const totalBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0);

  if (files.length === 0) return { ok: false, reason: "empty", totalBytes };
  if (totalBytes > SUBMISSION_MAX_BYTES) return { ok: false, reason: "too-large", totalBytes };
  return { ok: true, files: files.map((file) => ({ ...file, kind: classify(file.data) })), totalBytes };
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

// Text means valid UTF-8 without NUL bytes (git's heuristic plus a decode check).
function classify(data: Uint8Array): FileKind {
  if (data.includes(0)) return "binary";
  try {
    utf8.decode(data);
    return "text";
  } catch {
    return "binary";
  }
}

/** Thrown when files add up to more than a 제출물 may hold, before they are all read. */
export class UploadTooLargeError extends Error {}

/**
 * The files inside a zip. Folder entries and excluded paths are skipped without
 * being decompressed, and it stops before inflating more than the limit
 * (so a zip bomb can't exhaust the browser's memory).
 */
export function entriesFromZip(zip: Uint8Array): UploadEntry[] {
  let declaredBytes = 0;
  const files = unzipSync(zip, {
    filter: (file) => {
      if (file.name.endsWith("/") || isExcluded(normalizePath(file.name))) return false;
      declaredBytes += file.originalSize;
      if (declaredBytes > SUBMISSION_MAX_BYTES) throw new UploadTooLargeError();
      return true;
    },
  });
  return Object.entries(files).map(([path, data]) => ({ path, data }));
}

// Forward slashes, no empty, "." or ".." segments: zips and Windows use other forms.
function normalizePath(path: string): string {
  return path
    .split(/[\\/]/)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}

/** Whether the path is inside an excluded folder (or is an excluded file), like node_modules. */
export function isExcluded(path: string): boolean {
  return path.split("/").some((segment) => EXCLUDED_NAMES.has(segment));
}
