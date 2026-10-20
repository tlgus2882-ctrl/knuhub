// GitHub 공개 저장소로 제출 (#56): the server downloads a branch's archive, which then goes
// through the same 업로드 준비 as a zip. Only public repositories: no GitHub account is linked.
import { entriesFromZip, type UploadEntry } from "./prepare-upload";

export type GitHubRepo = { owner: string; repo: string; branch: string | null };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
// A conservative subset of git's ref name rules: no "..", no leading or trailing "/", no spaces.
const BRANCH = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._\-/]{1,250}$/;

/**
 * Owner, repo and branch from what a student pasted: github.com/owner/repo, with or
 * without https://, www., .git or a trailing slash, or a /tree/<branch> address (used
 * when the branch box is empty). An empty branch means the default branch. Null if not GitHub.
 */
export function parseGitHubRepo(input: string, branchInput: string): GitHubRepo | null {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/.exec(input.trim());
  if (!match) return null;
  const [, owner, repo, branchInUrl] = match;
  const branch = branchInput.trim() || branchInUrl || null;
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  if (branch !== null && !BRANCH.test(branch)) return null;
  return { owner, repo, branch };
}

/** The files of a GitHub archive, without the one folder (repo-branch/) GitHub wraps them in. */
export function entriesFromGitHubArchive(zip: Uint8Array): UploadEntry[] {
  return entriesFromZip(zip).map((entry) => ({ ...entry, path: entry.path.split("/").slice(1).join("/") }));
}

export type GitHubArchive =
  | { ok: true; zip: Uint8Array }
  | { ok: false; reason: "repo-not-found" | "branch-not-found" | "too-large" | "unavailable" };

// shortcut: a compressed archive over this is refused before unzipping, even if what is left after
// excluding folders would fit in 20MB; raise it if real repositories hit it.
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

/** Downloads the branch (or the default branch) as a zip. Server only: codeload.github.com sends no CORS headers. */
export async function downloadGitHubArchive({ owner, repo, branch }: GitHubRepo): Promise<GitHubArchive> {
  const ref = branch ? `refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}` : "HEAD";
  try {
    const response = await fetch(`https://codeload.github.com/${owner}/${repo}/zip/${ref}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 404) return { ok: false, reason: await notFoundReason(owner, repo, branch) };
    if (!response.ok || !response.body) return { ok: false, reason: "unavailable" };
    if (Number(response.headers.get("content-length")) > MAX_ARCHIVE_BYTES) return { ok: false, reason: "too-large" };
    const zip = await readAtMost(response.body, MAX_ARCHIVE_BYTES);
    return zip ? { ok: true, zip } : { ok: false, reason: "too-large" };
  } catch (error) {
    console.error("GitHub archive download failed", error);
    return { ok: false, reason: "unavailable" };
  }
}

// codeload answers 404 both for a missing (or private) repository and a missing branch. GitHub's
// API tells them apart: it also answers 404 for a private repository, so the two can't be told apart.
async function notFoundReason(owner: string, repo: string, branch: string | null) {
  if (!branch) return "repo-not-found";
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 404) return "repo-not-found";
  return response.ok ? "branch-not-found" : "unavailable";
}

/** The whole body, or null once it passes `limit` bytes (stops downloading there). */
async function readAtMost(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  const zip = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    zip.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return zip;
}
