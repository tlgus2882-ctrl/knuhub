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
  | { ok: false; reason: "too-large" | "empty" | "too-many-files" | "duplicate-paths"; totalBytes: number };

/** Folders and files that are never part of a 제출물. Matched against any path segment. */
const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  "__MACOSX",
  ".DS_Store",
  "Thumbs.db",
]);

/** Each file is its own Storage upload, so keep a 제출물 to a sane number of them. */
export const SUBMISSION_MAX_FILES = 1000;

export function prepareUpload(entries: UploadEntry[]): PreparedUpload {
  const files = entries
    .map((entry) => ({ ...entry, path: normalizePath(entry.path) }))
    .filter((entry) => entry.path !== "" && !isExcluded(entry.path));
  const totalBytes = files.reduce((sum, file) => sum + file.data.byteLength, 0);

  if (files.length === 0) return { ok: false, reason: "empty", totalBytes };
  if (totalBytes > SUBMISSION_MAX_BYTES) return { ok: false, reason: "too-large", totalBytes };
  if (files.length > SUBMISSION_MAX_FILES) return { ok: false, reason: "too-many-files", totalBytes };
  if (new Set(files.map((f) => f.path)).size < files.length) return { ok: false, reason: "duplicate-paths", totalBytes };
  return { ok: true, files: files.map((file) => ({ ...file, kind: classify(file.data) })), totalBytes };
}

const TEXT_ENCODINGS = [
  new TextDecoder("utf-8", { fatal: true }),
  // Older Korean files (Windows editors) are saved as CP949; the viewer decodes them too.
  new TextDecoder("euc-kr", { fatal: true }),
];

// Text means no NUL bytes (git's heuristic) and valid UTF-8 or CP949.
function classify(data: Uint8Array): FileKind {
  if (data.includes(0)) return "binary";
  for (const decoder of TEXT_ENCODINGS) {
    try {
      decoder.decode(data);
      return "text";
    } catch {
      // try the next encoding
    }
  }
  return "binary";
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
      if (file.name.endsWith("/") || isExcluded(normalizePath(zipEntryName(file.name)))) return false;
      declaredBytes += file.originalSize;
      if (declaredBytes > SUBMISSION_MAX_BYTES) throw new UploadTooLargeError();
      return true;
    },
  });
  return Object.entries(files).map(([name, data]) => ({ path: zipEntryName(name), data }));
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true });
const cp949 = new TextDecoder("euc-kr"); // browsers' euc-kr is the CP949 superset

/**
 * fflate reads a name without the zip's UTF-8 flag as Latin-1. Zips from Windows
 * Explorer store Korean names as CP949 that way, and some macOS tools store
 * UTF-8 without the flag; recover both. NFC so macOS's decomposed 한글 matches.
 */
function zipEntryName(name: string): string {
  if (/^[\x00-\x7f]*$/.test(name) || /[^\x00-\xff]/.test(name)) return name.normalize("NFC");
  const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
  try {
    return utf8Strict.decode(bytes).normalize("NFC");
  } catch {
    return cp949.decode(bytes).normalize("NFC");
  }
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
