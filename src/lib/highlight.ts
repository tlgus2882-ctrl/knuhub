import "server-only";
import { bundledLanguages, codeToHtml, type ShikiTransformer } from "shiki";

// Language from the file name: Shiki knows most extensions as aliases (py, ts, rs…).
const BY_NAME: Record<string, string> = { dockerfile: "dockerfile", makefile: "makefile" };
const BY_EXTENSION: Record<string, string> = { h: "c", hpp: "cpp", ipynb: "json", txt: "text" };

export function languageOf(path: string): string {
  const name = path.split("/").pop()!.toLowerCase();
  if (Object.hasOwn(BY_NAME, name)) return BY_NAME[name];
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  if (Object.hasOwn(BY_EXTENSION, extension)) return BY_EXTENSION[extension];
  return Object.hasOwn(bundledLanguages, extension) ? extension : "text";
}

/**
 * Syntax-highlighted HTML (Shiki escapes the code, so it is safe to inject).
 * Each line is a `.line` span with id `L<n>` (so `#L12` opens at line 12); line numbers come
 * from CSS (globals.css .code-view).
 */
export async function highlight(code: string, path: string): Promise<string> {
  const source = code.replace(/\r?\n$/, "");
  const options = { themes: { light: "github-light", dark: "github-dark" }, transformers: [LINE_IDS] };
  try {
    return await codeToHtml(source, { lang: languageOf(path), ...options });
  } catch {
    // A grammar that fails to load or tokenize still shows the code, unhighlighted.
    return codeToHtml(source, { lang: "text", ...options });
  }
}

const LINE_IDS: ShikiTransformer = {
  line(node, line) {
    node.properties.id = `L${line}`;
  },
};

const utf8 = new TextDecoder("utf-8", { fatal: true });
const cp949 = new TextDecoder("euc-kr");

/** File bytes as text: UTF-8, or CP949 for older Korean files saved that way. */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return cp949.decode(bytes);
  }
}
