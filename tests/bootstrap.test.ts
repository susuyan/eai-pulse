import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { bootstrapRepositoryDatabase } from "../src/db/bootstrap.js";
import { createDatabase } from "../src/db/database.js";

const databases: ReturnType<typeof createDatabase>[] = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
  while (temporaryRoots.length) await rm(temporaryRoots.pop() ?? "", { recursive: true });
});

describe("repository database bootstrap", () => {
  it("seeds a fresh database, restores the repository snapshot, and remains idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-bootstrap-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "data/snapshot"), { recursive: true });
    await writeFile(
      join(root, "data/snapshot/v1.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sources: [
            {
              slug: "openai",
              enabled: 1,
              observationEnabled: 0,
              lifecycleStatus: "active",
              healthScore: 100,
              consecutiveFailures: 0,
              successCount: 1,
              failureCount: 0,
              lastCollectedAt: "2026-07-14T00:00:00.000Z",
              lastSuccessAt: "2026-07-14T00:00:00.000Z",
              lastError: null,
              lastVerifiedAt: "2026-07-14T00:00:00.000Z",
              state: {},
            },
          ],
          signals: [
            {
              id: "bootstrap-snapshot-signal",
              sourceSlug: "openai",
              externalId: "bootstrap-snapshot-signal",
              canonicalUrl: "https://openai.com/index/bootstrap-snapshot-signal",
              title: "Repository bootstrap snapshot signal",
              summary: "This signal exists only in the versioned repository snapshot.",
              author: null,
              language: "en",
              publishedAt: "2026-07-14T00:00:00.000Z",
              category: "test",
              tags: ["bootstrap"],
              metrics: {},
              contentHash: "bootstrap-snapshot-content",
              createdAt: "2026-07-14T00:00:00.000Z",
              updatedAt: "2026-07-14T00:00:00.000Z",
            },
          ],
          discoveries: [],
          events: [],
          eventSignals: [],
        },
        null,
        2,
      )}\n`,
    );

    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);

    const first = await bootstrapRepositoryDatabase(db, config, { snapshotRootDir: root });
    expect(first).toMatchObject({ restored: true, counts: { sources: 1, signals: 1 } });
    expect(
      await db
        .selectFrom("signals")
        .select("id")
        .where("id", "=", "bootstrap-snapshot-signal")
        .executeTakeFirst(),
    ).toBeDefined();
    const firstCount = await signalCount(db);

    await bootstrapRepositoryDatabase(db, config, { snapshotRootDir: root });
    expect(await signalCount(db)).toBe(firstCount);
  });

  it("keeps the main repository snapshot above the catalog-only seed baseline", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const snapshot = JSON.parse(
      await readFile(join(config.rootDir, "data/snapshot/v1.json"), "utf8"),
    ) as { sources: unknown[]; signals: unknown[] };
    expect(snapshot.sources.length).toBeGreaterThanOrEqual(414);
    expect(snapshot.signals.length).toBeGreaterThanOrEqual(4_940);
  });

  it("uses the shared bootstrap for local serve, seed, and default export", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    for (const file of ["serve.ts", "seed.ts", "export.ts"]) {
      const source = await readFile(join(config.rootDir, "src/cli", file), "utf8");
      expect(source).toContain("bootstrapRepositoryDatabase");
    }
  });
});

async function signalCount(db: ReturnType<typeof createDatabase>): Promise<number> {
  const row = await db
    .selectFrom("signals")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
