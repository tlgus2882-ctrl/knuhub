// Turns a 제출물's flat file paths into the folder tree the code viewer shows.

export type FileTreeNode =
  | { type: "folder"; name: string; children: FileTreeNode[] }
  | { type: "file"; name: string; path: string };

/** Folders first, then files, each sorted by name. */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const path of paths) {
    const segments = path.split("/");
    let level = root;
    for (const [i, name] of segments.entries()) {
      if (i === segments.length - 1) {
        level.push({ type: "file", name, path });
        break;
      }
      let folder = level.find((n): n is Extract<FileTreeNode, { type: "folder" }> => n.type === "folder" && n.name === name);
      if (!folder) {
        folder = { type: "folder", name, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
  }
  return sortTree(root);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((n) => (n.type === "folder" ? { ...n, children: sortTree(n.children) } : n))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "ko") : a.type === "folder" ? -1 : 1));
}
