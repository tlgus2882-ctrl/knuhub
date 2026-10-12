// Browser side of 업로드 준비: reads what the 수강생 picked or dropped into
// UploadEntry[] for prepareUpload(). Excluded folders are skipped before their
// files are read, so dropping a project with node_modules stays fast.
import { entriesFromZip, isExcluded, UploadTooLargeError, type UploadEntry } from "./prepare-upload";
import { SUBMISSION_MAX_BYTES } from "./storage";

/** A file and the path it had inside the picked or dropped folder. */
export type PickedFile = { path: string; file: File };

/** Files from an <input type="file">, with or without webkitdirectory. */
export function pickedFromInput(files: File[]): PickedFile[] {
  return files.map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

/** Files and folders dropped on the page, walking folders recursively. */
export async function pickedFromDrop(items: DataTransferItemList): Promise<PickedFile[]> {
  // Entries must be taken synchronously, before the drop event ends.
  const roots = Array.from(items, (item) => item.webkitGetAsEntry()).filter((e) => e !== null);
  const picked: PickedFile[] = [];
  for (const root of roots) await walk(root, picked);
  return picked;
}

async function walk(entry: FileSystemEntry, into: PickedFile[]): Promise<void> {
  const path = entry.fullPath.replace(/^\//, "");
  if (isExcluded(path)) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    into.push({ path, file });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most ~100 entries per call; keep reading until empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, into);
  }
}

/**
 * Reads the picked files. A .zip picked or dropped on its own (not inside a
 * folder) is unpacked in place of itself; excluded paths are never read.
 * Throws UploadTooLargeError before reading anything when the files are
 * already over the limit.
 */
export async function readPicked(picked: PickedFile[]): Promise<UploadEntry[]> {
  const kept = picked.filter((p) => !isExcluded(p.path));
  const isTopLevelZip = (p: PickedFile) => !p.path.includes("/") && p.path.toLowerCase().endsWith(".zip");
  const plain = kept.filter((p) => !isTopLevelZip(p));
  if (plain.reduce((sum, p) => sum + p.file.size, 0) > SUBMISSION_MAX_BYTES) throw new UploadTooLargeError();

  const unzipped = await Promise.all(
    kept.filter(isTopLevelZip).map(async (p) => entriesFromZip(new Uint8Array(await p.file.arrayBuffer()))),
  );
  const read = await Promise.all(plain.map(async (p) => ({ path: p.path, data: new Uint8Array(await p.file.arrayBuffer()) })));
  return [...unzipped.flat(), ...read];
}
