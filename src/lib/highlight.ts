import "server-only";
import { bundledLanguages, codeToHtml } from "shiki";

// Language from the file name: Shiki knows most extensions as aliases (py, ts, rs…).
const BY_NAME: Record<string, string> = { dockerfile: "dockerfile", makefile: "makefile" };
const BY_EXTENSION: Record<string, string> = { h: "c", hpp: "cpp", ipynb: "json", txt: "text" };

export function languageOf(path: string): string {
  const name = path.split("/").pop()!.toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  if (BY_EXTENSION[extension]) return BY_EXTENSION[extension];
  return extension in bundledLanguages ? extension : "text";
}

/**
 * Syntax-highlighted HTML (Shiki escapes the code, so it is safe to inject).
 * Each line is a `.line` span; line numbers come from CSS (globals.css .code-view).
 */
export async function highlight(code: string, path: string): Promise<string> {
  return codeToHtml(code.replace(/\r?\n$/, ""), {
    lang: languageOf(path),
    themes: { light: "github-light", dark: "github-dark" },
  });
}
