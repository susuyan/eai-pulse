import { afterEach, describe, expect, it, vi } from "vitest";
import {
  githubDataAtBuildTime,
  githubDataFromEnvironment,
} from "../src/pipeline/static-site/github.js";

describe("build-time GitHub metadata", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps fresh numeric metadata", () => {
    vi.stubEnv("GITHUB_STARS", "42");
    vi.stubEnv("GITHUB_FORKS", "7");
    vi.stubEnv("GITHUB_OPEN_ISSUES", "3");
    vi.stubEnv("GITHUB_METADATA_FETCHED_AT", "2026-07-12T10:00:00.000Z");
    expect(githubDataFromEnvironment("0.6.0", new Date("2026-07-12T12:00:00.000Z"))).toMatchObject({
      stars: 42,
      forks: 7,
      openIssues: 3,
      latestRelease: "v0.6.0",
    });
  });

  it("does not display stale numbers", () => {
    vi.stubEnv("GITHUB_STARS", "999");
    vi.stubEnv("GITHUB_METADATA_FETCHED_AT", "2026-07-10T10:00:00.000Z");
    expect(githubDataFromEnvironment("0.6.0", new Date("2026-07-12T12:00:00.000Z"))).toMatchObject({
      stars: null,
      fetchedAt: null,
    });
  });

  it("fetches the real repository counters when build metadata is missing", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ stargazers_count: 23, forks_count: 4, open_issues_count: 2 }),
          { status: 200 },
        ),
    );
    await expect(
      githubDataAtBuildTime("0.6.0", {
        now: new Date("2026-07-12T12:00:00.000Z"),
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      stars: 23,
      forks: 4,
      openIssues: 2,
      fetchedAt: "2026-07-12T12:00:00.000Z",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/susuyan/eai-pulse",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: expect.any(String) }) }),
    );
  });

  it("keeps static export available when GitHub cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(githubDataAtBuildTime("0.6.0", { fetchImpl })).resolves.toMatchObject({
      stars: null,
      fetchedAt: null,
    });
  });
});
