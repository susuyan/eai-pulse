import { describe, expect, it } from "vitest";
import { jsonApiAdapter } from "../../src/collectors/json-api.js";
import { loadConfig } from "../../src/config/env.js";
import type { SourceDescriptor } from "../../src/domain/types.js";

const source: SourceDescriptor = {
  id: "fixture",
  slug: "unrelated-name",
  name: "Release fixture",
  homepageUrl: "https://github.com/example/project",
  adapter: "json-api",
  tier: 1,
  role: "primary",
  region: "GLOBAL",
  language: "en",
  authorityScore: 90,
  config: { url: "https://api.github.com/repos/example/project/releases" },
  state: {},
};
const release = {
  name: "Stable release",
  tag_name: "v1",
  url: "https://api.github.com/repos/example/project/releases/1",
  html_url: "https://github.com/example/project/releases/tag/v1",
  published_at: "2026-07-17T05:12:30Z",
  draft: false,
};
const collect = (payload: unknown, finalUrl = source.config.url) =>
  jsonApiAdapter.collect(source, {
    config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" }),
    fetchText: async () => ({
      body: JSON.stringify(payload),
      status: 200,
      finalUrl,
      headers: new Headers(),
      attemptCount: 1,
      responseBytes: 0,
    }),
  });

describe("JSON API adapter", () => {
  it("constrains every API redirect to the official endpoint origin", async () => {
    await jsonApiAdapter.collect(source, {
      config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" }),
      fetchText: async (_url, _headers, constraints) => {
        expect(constraints).toEqual({ allowedOrigin: "https://api.github.com" });
        return {
          body: "[]",
          status: 200,
          finalUrl: source.config.url,
          headers: new Headers(),
          attemptCount: 1,
          responseBytes: 2,
        };
      },
    });
  });
  it("normalizes release aliases to public HTML URLs and explicit dates", async () => {
    expect(await collect([release])).toEqual([
      expect.objectContaining({
        title: "Stable release",
        url: release.html_url,
        publishedAt: "2026-07-17T05:12:30.000Z",
        rawMeta: { dateInferred: false },
      }),
    ]);
  });
  it("uses a release tag when name is empty and deduplicates URLs", async () => {
    const items = await collect([
      { ...release, name: "" },
      { ...release, name: "" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("v1");
  });
  it.each([
    undefined,
    "",
    "not-a-date",
    "2026-02-30",
  ])("rejects missing or invalid publication date %s", async (published_at) => {
    await expect(collect([{ ...release, published_at }])).rejects.toThrow();
  });
  it("keeps the existing normalized array format", async () => {
    const items = await collect([
      { title: "Dated item", url: "https://example.com/item", publishedAt: "2026-07-01T00:00:00Z" },
    ]);
    expect(items[0]).toMatchObject({
      title: "Dated item",
      publishedAt: "2026-07-01T00:00:00.000Z",
    });
  });
  it.each([
    undefined,
    "",
    "not-a-date",
    "2026-02-30",
  ])("does not infer a normalized item date %s", async (publishedAt) => {
    await expect(
      collect([{ title: "Dated item", url: "https://example.com/item", publishedAt }]),
    ).rejects.toThrow(/publication date/);
  });
  it("rejects schema drift", async () => {
    await expect(collect({ releases: [release] })).rejects.toThrow(/array/);
  });
  it("accepts an empty release list", async () => {
    expect(await collect([])).toEqual([]);
  });
  it("excludes draft releases", async () => {
    expect(await collect([{ ...release, draft: true }])).toEqual([]);
  });
  it("rejects a response redirected to a different host", async () => {
    await expect(collect([release], "https://other.example/releases")).rejects.toThrow();
  });
  it.each([
    "http://github.com/example/item",
    "https://user:secret@github.com/item",
    "https://127.0.0.1/item",
  ])("rejects non-public canonical URL %s", async (html_url) => {
    await expect(collect([{ ...release, html_url }])).rejects.toThrow();
  });
});
