import Link from "next/link";
import type { FileTreeNode } from "@/lib/submissions/file-tree";

type Props = { nodes: FileTreeNode[]; selected: string | undefined; hrefFor: (path: string) => string };

export function FileTree({ nodes, selected, hrefFor }: Props) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={`folder:${node.name}`}>
            <span className="block truncate px-2 py-0.5 text-muted-foreground">{node.name}/</span>
            <div className="ml-3 border-l pl-1">
              <FileTree nodes={node.children} selected={selected} hrefFor={hrefFor} />
            </div>
          </li>
        ) : (
          <li key={node.path}>
            <Link
              href={hrefFor(node.path)}
              aria-current={node.path === selected ? "page" : undefined}
              className={`block truncate rounded px-2 py-0.5 hover:bg-muted ${
                node.path === selected ? "bg-muted font-medium" : ""
              }`}
            >
              {node.name}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}
