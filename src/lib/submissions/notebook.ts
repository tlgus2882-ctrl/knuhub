// Jupyter 노트북(.ipynb, nbformat 4) for the code viewer: cells and their outputs, from the raw JSON.
// Only safe output kinds are kept: plain text and PNG/JPEG/GIF images. HTML, SVG and JavaScript
// outputs fall back to their text/plain form, so nothing from a submission runs in the page.

export type NotebookOutput =
  | { kind: "text"; text: string; error: boolean }
  | { kind: "image"; mime: (typeof IMAGE_TYPES)[number]; data: string };

export type NotebookCell = {
  type: "markdown" | "code" | "raw";
  source: string;
  executionCount: number | null;
  outputs: NotebookOutput[];
  /** Images pasted into a markdown cell, by the URL its source uses (`attachment:<name>`) → a data URL. */
  attachments: Record<string, string>;
};

export type Notebook = { language: string; cells: NotebookCell[] };

export const isNotebook = (path: string) => path.toLowerCase().endsWith(".ipynb");

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"] as const;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
/** nbformat stores multi-line strings either as one string or as a list of lines. */
const joined = (value: unknown): string =>
  Array.isArray(value) ? value.filter((part) => typeof part === "string").join("") : typeof value === "string" ? value : "";

/** The notebook, or null when the text is not an nbformat 4 notebook. */
export function parseNotebook(text: string): Notebook | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(json) || !Array.isArray(json.cells)) return null;

  const metadata = isObject(json.metadata) ? json.metadata : {};
  const kernel = isObject(metadata.kernelspec) ? metadata.kernelspec.language : undefined;
  const info = isObject(metadata.language_info) ? metadata.language_info.name : undefined;
  const language = (typeof kernel === "string" ? kernel : typeof info === "string" ? info : "python").toLowerCase();

  const cells = json.cells.filter(isObject).map((cell): NotebookCell => {
    const type = cell.cell_type === "markdown" || cell.cell_type === "raw" ? cell.cell_type : "code";
    return {
      type,
      source: joined(cell.source),
      executionCount: type === "code" && typeof cell.execution_count === "number" ? cell.execution_count : null,
      outputs: type === "code" && Array.isArray(cell.outputs) ? cell.outputs.filter(isObject).flatMap(toOutput) : [],
      attachments: isObject(cell.attachments) ? toAttachments(cell.attachments) : {},
    };
  });
  return { language, cells };
}

/** The first safe image in a mime bundle (base64, without the line breaks nbformat may add). */
function imageOf(bundle: Json) {
  const mime = IMAGE_TYPES.find((type) => typeof bundle[type] === "string" || Array.isArray(bundle[type]));
  return mime ? { mime, data: joined(bundle[mime]).replace(/\s/g, "") } : null;
}

function toAttachments(attachments: Json): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attachments).flatMap(([name, bundle]) => {
      const image = isObject(bundle) ? imageOf(bundle) : null;
      return image ? [[`attachment:${name}`, `data:${image.mime};base64,${image.data}`]] : [];
    }),
  );
}

function toOutput(output: Json): NotebookOutput[] {
  if (output.output_type === "stream") return [{ kind: "text", text: joined(output.text), error: false }];
  if (output.output_type === "error") {
    const traceback = joined(Array.isArray(output.traceback) ? output.traceback.join("\n") : "");
    return [{ kind: "text", text: traceback.replace(ANSI, ""), error: true }];
  }
  const data = isObject(output.data) ? output.data : {};
  const image = imageOf(data);
  if (image) return [{ kind: "image", ...image }];
  const plain = joined(data["text/plain"]);
  return plain ? [{ kind: "text", text: plain, error: false }] : [];
}

/** Text output lines the AI sees per output; the rest is summarised (long prints add tokens, not evidence). */
const REVIEW_OUTPUT_LINES = 20;
const CELL_KIND = { markdown: "마크다운", code: "코드", raw: "원시" } as const;

/**
 * The notebook as plain text for AI 검토: a header line per cell, its source, then its text outputs
 * (cut to REVIEW_OUTPUT_LINES) and one "[그림 출력]" line per image. Images are left out because
 * their base64 would cost far more tokens than all the code. `cellOfLine[i]` is the cell (from 1)
 * line i+1 belongs to, so the AI's evidence lines can point to a cell.
 */
export function notebookReviewText(notebook: Notebook): { text: string; cellOfLine: number[] } {
  const lines: string[] = [];
  const cellOfLine: number[] = [];
  notebook.cells.forEach((cell, i) => {
    const push = (...more: string[]) => {
      lines.push(...more);
      cellOfLine.push(...more.map(() => i + 1));
    };
    const run = cell.type === "code" && cell.executionCount !== null ? ` [${cell.executionCount}]` : "";
    push(`# ── ${i + 1}번 셀 (${CELL_KIND[cell.type]}${run}) ──`, ...cell.source.replace(/\n$/, "").split("\n"));
    for (const output of cell.outputs) {
      if (output.kind === "image") {
        push("# [그림 출력]");
        continue;
      }
      const out = output.text.replace(/\n$/, "").split("\n");
      push(output.error ? "# [오류 출력]" : "# [출력]", ...out.slice(0, REVIEW_OUTPUT_LINES));
      if (out.length > REVIEW_OUTPUT_LINES) push(`# … (${out.length - REVIEW_OUTPUT_LINES}줄 생략)`);
    }
  });
  return { text: lines.join("\n"), cellOfLine };
}
