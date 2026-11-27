import { structuredPatch } from "diff";

/** How a file changed between two versions of a 제출물. */
export type FileChange = "added" | "removed" | "changed" | "unchanged";

export type VersionFile = { path: string; kind: "text" | "binary"; size: number };

/** One file present in either version, paired by path. */
export type FilePair = {
  path: string;
  before: VersionFile | null;
  after: VersionFile | null;
};

/**
 * Pairs the files of two versions by path, sorted by path. A file whose kind changed (text ↔ binary)
 * is still one pair; the caller compares its bytes.
 */
export function pairFiles(before: VersionFile[], after: VersionFile[]): FilePair[] {
  const pairs = new Map<string, FilePair>();
  for (const f of before) pairs.set(f.path, { path: f.path, before: f, after: null });
  for (const f of after) pairs.set(f.path, { path: f.path, before: pairs.get(f.path)?.before ?? null, after: f });
  return [...pairs.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The change for a pair, given whether both sides' bytes are equal (only asked when both exist). */
export function changeOf(pair: FilePair, sameBytes: () => boolean): FileChange {
  if (!pair.before) return "added";
  if (!pair.after) return "removed";
  if (pair.before.size !== pair.after.size) return "changed";
  return sameBytes() ? "unchanged" : "changed";
}

export type DiffLine =
  | { type: "context"; oldNo: number; newNo: number; text: string }
  | { type: "removed"; oldNo: number; text: string }
  | { type: "added"; newNo: number; text: string };

export type DiffHunk = { oldStart: number; newStart: number; lines: DiffLine[] };

/** Lines around each change that are shown unchanged. */
export const DIFF_CONTEXT_LINES = 3;

/**
 * Line differences between two texts as hunks with a few lines of context. Line endings (CRLF or LF)
 * do not count as changes. Returns no hunks for equal texts.
 */
export function diffText(before: string, after: string): DiffHunk[] {
  const patch = structuredPatch("before", "after", normalize(before), normalize(after), undefined, undefined, {
    context: DIFF_CONTEXT_LINES,
  });
  return patch.hunks.map((hunk) => {
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;
    const lines: DiffLine[] = [];
    for (const raw of hunk.lines) {
      const sign = raw[0];
      const text = raw.slice(1);
      if (sign === "\\") continue; // "\ No newline at end of file"
      if (sign === "-") lines.push({ type: "removed", oldNo: oldNo++, text });
      else if (sign === "+") lines.push({ type: "added", newNo: newNo++, text });
      else lines.push({ type: "context", oldNo: oldNo++, newNo: newNo++, text });
    }
    return { oldStart: hunk.oldStart, newStart: hunk.newStart, lines };
  });
}

/** Counts of added and removed lines in some hunks. */
export function countChanges(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks)
    for (const line of hunk.lines) {
      if (line.type === "added") added++;
      else if (line.type === "removed") removed++;
    }
  return { added, removed };
}

/** CRLF → LF, and a missing final newline added, so neither shows up as a change. */
function normalize(text: string): string {
  const lf = text.replace(/\r\n/g, "\n");
  return lf === "" || lf.endsWith("\n") ? lf : `${lf}\n`;
}

/** Byte-for-byte equality of two files. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
