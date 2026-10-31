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
    };
  });
  return { language, cells };
}

function toOutput(output: Json): NotebookOutput[] {
  if (output.output_type === "stream") return [{ kind: "text", text: joined(output.text), error: false }];
  if (output.output_type === "error") {
    const traceback = joined(Array.isArray(output.traceback) ? output.traceback.join("\n") : "");
    return [{ kind: "text", text: traceback.replace(ANSI, ""), error: true }];
  }
  const data = isObject(output.data) ? output.data : {};
  const image = IMAGE_TYPES.find((mime) => typeof data[mime] === "string" || Array.isArray(data[mime]));
  if (image) return [{ kind: "image", mime: image, data: joined(data[image]).replace(/\s/g, "") }];
  const plain = joined(data["text/plain"]);
  return plain ? [{ kind: "text", text: plain, error: false }] : [];
}
