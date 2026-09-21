import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchPolicy } from "../../src/collectors/fetcher.js";
import { loadConfig } from "../../src/config/env.js";
import { createDatabase } from "../../src/db/database.js";
import { migrateToLatest } from "../../src/db/migrate.js";
import { Repository } from "../../src/db/repository.js";
import { seedDatabase } from "../../src/db/seed.js";
import { collectSources } from "../../src/pipeline/collect.js";
import { auditSources } from "../../src/pipeline/source-audit.js";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("../../src/domain/source-audit-policy.js", () => ({
  sourceAuditPolicy: () => "allowed_metadata",
}));
vi.mock("../../src/collectors/fetcher.js", async (original) => ({
  ...(await original<typeof import("../../src/collectors/fetcher.js")>()),
  createSafeFetcher: () => fetcher,
}));
const databases: ReturnType<typeof createDatabase>[] = [];
afterEach(async () => {
  fetcher.mockReset();
  while (databases.length) await databases.pop()?.destroy();
});

async function setup(failDetail = false) {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  const repository = new Repository(db);
  const row = await repository.getSourceByIdOrSlug("beijing-humanoid-center");
  if (!row) throw new Error("Missing test source");
  const initialState = { etag: "old-list", lastModified: "old-date", cursor: "unchanged" };
  // This eligibility change exists only inside the disposable test database.
  await repository.updateSource(row.id, {
    lifecycle_status: "shadow",
    maintenance_status: "candidate",
    rate_limit_per_minute: 60000,
    state_json: JSON.stringify(initialState),
    config_json: JSON.stringify({
      url: "https://example.com/list",
      html: {
        records: ".record",
        title: { selector: "a" },
        link: { selector: "a", attribute: "href" },
        detail: {
          take: 1,
          title: { selector: "h1" },
          date: { selector: "time", format: "ymd", semantic: "published" },
        },
      },
    }),
  });
  const listing =
    '<html><body><div class="record"><a href="/detail">New robot dataset collection and quality benchmark release</a></div></body></html>';
  const detail =
    "<h1>New robot dataset collection and quality benchmark release</h1><time>2026-09-17</time>";
  fetcher.mockImplementation(
    async (url: string, headers: Record<string, string>, policy: FetchPolicy) => {
      expect(policy).toMatchObject({ allowedOrigin: "https://example.com" });
      if (url.endsWith("/detail")) {
        expect(headers).not.toHaveProperty("if-none-match");
        expect(headers).not.toHaveProperty("if-modified-since");
        if (failDetail) throw new Error("Detail failed");
      }
      return {
        body: url.endsWith("/list") ? listing : detail,
        status: 200,
        finalUrl: url,
        headers: new Headers({
          etag: url.endsWith("/list") ? "new-list" : "detail-tag",
          "last-modified": url.endsWith("/list") ? "new-date" : "detail-date",
        }),
        attemptCount: 1,
        responseBytes: 200,
      };
    },
  );
  return { config, db, repository, row, initialState };
}

describe("configured HTML pipeline requests", () => {
  it("forwards safety constraints and commits only the primary response validators", async () => {
    const { db, config, repository, row, initialState } = await setup();
    const result = await collectSources(db, config, row.id);
    expect(result.errors).toEqual([]);
    expect(result.collected).toBe(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      "if-none-match": initialState.etag,
      "if-modified-since": initialState.lastModified,
    });
    expect(JSON.parse((await repository.getSource(row.id))?.state_json ?? "{}")).toEqual({
      ...initialState,
      etag: "new-list",
      lastModified: "new-date",
    });
  });
  it("does not commit primary validators or cursor when the detail request fails", async () => {
    const { db, config, repository, row, initialState } = await setup(true);
    const result = await collectSources(db, config, row.id);
    expect(result.errors).toHaveLength(1);
    expect(result.created).toBe(0);
    expect(JSON.parse((await repository.getSource(row.id))?.state_json ?? "{}")).toEqual(
      initialState,
    );
  });
  it("forwards the same constraints in audit and does not change collection state", async () => {
    const { db, config, repository, row, initialState } = await setup();
    const report = await auditSources(db, config, { sourceId: row.id });
    expect(report.results[0]?.itemCount).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse((await repository.getSource(row.id))?.state_json ?? "{}")).toEqual(
      initialState,
    );
  });
});
