import { Markdown } from "@/components/markdown";
import { highlight } from "@/lib/highlight";
import type { Notebook } from "@/lib/submissions/notebook";

/** A Jupyter 노트북 as cells: rendered markdown, highlighted code and its text and image outputs. */
export async function NotebookView({ notebook }: { notebook: Notebook }) {
  const code = await Promise.all(
    notebook.cells.map((cell) => (cell.type === "code" ? highlight(cell.source, `cell.${notebook.language}`, { lineIds: false }) : null)),
  );

  if (!notebook.cells.length) return <p className="rounded-lg border p-6 text-sm text-muted-foreground">빈 노트북이에요.</p>;

  return (
    <ol className="flex flex-col gap-4">
      {notebook.cells.map((cell, i) => (
        // #cell-N (from 1) is where AI 검토 evidence in a notebook points.
        <li key={i} id={`cell-${i + 1}`} className="notebook-cell grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 rounded-lg">
          <span className="pt-3 text-right font-mono text-xs text-muted-foreground">
            {cell.type === "code" && `[${cell.executionCount ?? " "}]`}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            {cell.type === "markdown" ? (
              <div className="min-w-0 rounded-lg px-3 py-1">
                <Markdown images={cell.attachments}>{cell.source}</Markdown>
              </div>
            ) : cell.type === "raw" ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-[13px] whitespace-pre-wrap">{cell.source}</pre>
            ) : (
              <div className="notebook-code" dangerouslySetInnerHTML={{ __html: code[i]! }} />
            )}
            {cell.outputs.map((output, j) =>
              output.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a base64 output from the notebook; next/image can't optimise it
                <img key={j} src={`data:${output.mime};base64,${output.data}`} alt={`${i + 1}번 셀의 출력 그림`} className="max-w-full self-start rounded border bg-white" />
              ) : (
                <pre
                  key={j}
                  className={`max-h-96 overflow-auto rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ${output.error ? "bg-destructive/10 text-destructive" : "bg-muted/40"}`}
                >
                  {output.text}
                </pre>
              ),
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
