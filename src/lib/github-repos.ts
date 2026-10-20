// 프로필 GitHub 공개 저장소 목록 (#57): read from GitHub's API on the server, cached for a while
// so a popular profile doesn't use up the unauthenticated limit (60 requests an hour per IP).
import { cacheLife } from "next/cache";

export type GitHubRepoSummary = { name: string; url: string; description: string | null; language: string | null; stars: number };

const SHOWN = 10;

/** The user's newest-updated public repositories (not forks). Throws if GitHub fails, so failures aren't cached. */
export async function publicRepos(githubId: string): Promise<GitHubRepoSummary[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(githubId)}/repos?type=owner&sort=updated&per_page=30`,
    { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10_000) },
  );
  // No such account: nothing to show (worth caching too).
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub repos ${response.status}`);
  const repos = (await response.json()) as {
    name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    fork: boolean;
  }[];
  return repos
    .filter((repo) => !repo.fork)
    .slice(0, SHOWN)
    .map((repo) => ({
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
    }));
}
