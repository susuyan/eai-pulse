import type { GithubData } from "./dto.js";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface GithubBuildOptions {
  now?: Date;
  allowNetwork?: boolean;
  fetchImpl?: typeof fetch;
}

export function githubDataFromEnvironment(version: string, now = new Date()): GithubData {
  const fetchedAt = validDate(process.env.GITHUB_METADATA_FETCHED_AT);
  const fresh = fetchedAt !== null && now.getTime() - fetchedAt.getTime() <= MAX_AGE_MS;

  return {
    repositoryUrl: process.env.GITHUB_REPOSITORY_URL || "https://github.com/susuyan/eai-pulse",
    stars: fresh ? nullableNumber(process.env.GITHUB_STARS) : null,
    forks: fresh ? nullableNumber(process.env.GITHUB_FORKS) : null,
    openIssues: fresh ? nullableNumber(process.env.GITHUB_OPEN_ISSUES) : null,
    latestRelease: process.env.GITHUB_LATEST_RELEASE || `v${version}`,
    fetchedAt: fresh && fetchedAt ? fetchedAt.toISOString() : null,
  };
}

export async function githubDataAtBuildTime(
  version: string,
  options: GithubBuildOptions = {},
): Promise<GithubData> {
  const now = options.now ?? new Date();
  const fallback = githubDataFromEnvironment(version, now);
  if (fallback.stars !== null || options.allowNetwork === false) return fallback;

  const apiUrl = githubRepositoryApiUrl(fallback.repositoryUrl);
  if (!apiUrl) return fallback;

  try {
    const response = await (options.fetchImpl ?? fetch)(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "agent-pulse-static-export",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return fallback;
    const metadata = (await response.json()) as Record<string, unknown>;
    const stars = apiNumber(metadata.stargazers_count);
    if (stars === null) return fallback;
    return {
      ...fallback,
      stars,
      forks: apiNumber(metadata.forks_count),
      openIssues: apiNumber(metadata.open_issues_count),
      fetchedAt: now.toISOString(),
    };
  } catch {
    return fallback;
  }
}

function nullableNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function apiNumber(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function githubRepositoryApiUrl(repositoryUrl: string): string | null {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repository] = url.pathname
      .replace(/^\//, "")
      .replace(/\.git$/, "")
      .split("/");
    if (!owner || !repository) return null;
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  } catch {
    return null;
  }
}

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
