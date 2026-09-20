import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { exportStaticSite } from "../src/pipeline/export.js";
import { validatePublicSite } from "../src/pipeline/public-site-integrity.js";

const databases: ReturnType<typeof createDatabase>[] = [];
const directories: string[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
  while (directories.length) {
    const directory = directories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("embodied public-site integrity", () => {
  it("validates the route contract, DTO counts, RSS, and zero legacy leaks", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-integrity-"));
    directories.push(root);
    const base = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const config = { ...base, distDir: join(root, "dist") };
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    await exportStaticSite(db, config);

    const report = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(report).toMatchObject({
      ok: true,
      counts: {
        events: 36,
        pipelineStages: 6,
        datasets: 12,
        standards: 4,
        collectionMethods: 6,
        peers: 15,
        sources: 36,
        scout: 6,
      },
      issues: [],
    });

    const rss = await readFile(join(config.distDir, "feed.xml"), "utf8");
    expect(rss).toContain('<rss version="2.0"');
    expect(rss.match(/<item>/g)).toHaveLength(36);
    expect(rss).not.toContain("模型价格");
    expect(rss).not.toContain("/lines/");

    const llmsPath = join(config.distDir, "llms.txt");
    const llms = await readFile(llmsPath, "utf8");
    const publicProduct = await readFile(join(config.distDir, "data/product.json"), "utf8");
    const changelog = await readFile(join(config.distDir, "changelog/index.html"), "utf8");
    for (const output of [publicProduct, changelog]) {
      expect(output).not.toMatch(
        /模型价格|六个领域趋势|model pricing|six strategic lines|model-economics|\/lines\//i,
      );
    }
    await writeFile(llmsPath, `${llms}\nLegacy: /lines/ and model pricing`, "utf8");
    const leaked = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(leaked.ok).toBe(false);
    expect(leaked.issues).toContainEqual(
      expect.objectContaining({ code: "legacy_public_leak", path: "llms.txt" }),
    );
  });
});
