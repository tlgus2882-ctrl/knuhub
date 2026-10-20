import { Star } from "lucide-react";
import { publicRepos, type GitHubRepoSummary } from "@/lib/github-repos";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The person's GitHub 공개 저장소, only when their 연락처 공개 범위 lets the viewer see their GitHub
 * 아이디 (author_contacts() returns nothing otherwise). Nothing is shown if GitHub fails.
 */
export async function GitHubRepos({ userId }: { userId: string }) {
  const supabase = await createServerSupabase();
  const { data: contacts } = await supabase.rpc("author_contacts", { target: userId });
  const githubId = contacts?.[0]?.github;
  if (!githubId) return null;

  let repos: GitHubRepoSummary[];
  try {
    repos = await publicRepos(githubId);
  } catch (error) {
    console.error("GitHub repos failed", error);
    return null;
  }
  if (!repos.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">GitHub 공개 저장소</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {repos.map((repo) => (
          <li key={repo.url}>
            <a href={repo.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted">
              <span className="font-medium break-all text-primary">{repo.name}</span>
              {repo.description && <span className="text-sm text-muted-foreground">{repo.description}</span>}
              <span className="flex gap-3 text-xs text-muted-foreground">
                {repo.language && <span>{repo.language}</span>}
                {repo.stars > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="size-3" aria-hidden />
                    {repo.stars}
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
