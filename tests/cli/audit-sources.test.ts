import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAuditArgs, runAuditCli } from "../../src/cli/audit-sources.js";
import * as fetcherModule from "../../src/collectors/fetcher.js";
import { loadConfig } from "../../src/config/env.js";
import { createDatabase } from "../../src/db/database.js";
import { migrateToLatest } from "../../src/db/migrate.js";
import { Repository } from "../../src/db/repository.js";
import { seedDatabase } from "../../src/db/seed.js";

const databases: ReturnType<typeof createDatabase>[] = [];
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  while (databases.length) await databases.pop()?.destroy();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

async function setupCli() {
  const directory = await mkdtemp(join(tmpdir(), "source-audit-cli-"));
  directories.push(directory);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", `sqlite:${join(directory, "audit.db")}`);
  const config = loadConfig();
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return { db, repository: new Repository(db) };
}

describe("source audit CLI", () => {
  it("accepts separated and inline values plus the output alias", () => {
    expect(
      parseAuditArgs([
        "--source",
        "openai",
        "--concurrency=6",
        "--output",
        "data/reports/source-health.json",
      ]),
    ).toEqual({
      sourceSlugs: ["openai"],
      concurrency: 6,
      reportPath: "data/reports/source-health.json",
      help: false,
    });
  });

  it("deduplicates mixed source forms in first-request order", () => {
    expect(parseAuditArgs(["--source", "a", "--source=b", "--source", "a"])).toEqual({
      sourceSlugs: ["a", "b"],
      help: false,
    });
    expect(parseAuditArgs([])).toEqual({ sourceSlugs: [], help: false });
  });

  it("rejects an unknown slug before any request or audit job even when a later slug exists", async () => {
    const { repository } = await setupCli();
    const beforeJobs = await repository.listJobs();
    const beforeChecks = await repository.listSourceChecks();
    const requests: string[] = [];
    vi.spyOn(fetcherModule, "createSafeFetcher").mockReturnValue(async (url) => {
      requests.push(url);
      throw new Error("Network must not start");
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(runAuditCli(["--source=unknown-source", "--source", "openai"])).rejects.toThrow(
      "unknown-source",
    );
    expect(requests).toEqual([]);
    expect(await repository.listJobs()).toEqual(beforeJobs);
    expect(await repository.listSourceChecks()).toEqual(beforeChecks);
  });

  it("resolves all requested slugs in order and keeps the no-source all-sources behavior", async () => {
    const { db, repository } = await setupCli();
    // Restricted rows exercise selection and real check persistence without network access.
    await db.updateTable("sources").set({ maintenance_status: "restricted" }).execute();
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runAuditCli(["--source=openai", "--source", "anthropic", "--source=openai"]);
    const selected = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
    expect(selected.results.map((result: { slug: string }) => result.slug)).toEqual([
      "openai",
      "anthropic",
    ]);
    expect(await repository.listSourceChecks()).toHaveLength(2);
    await runAuditCli([]);
    const all = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
    expect(all.results.map((result: { slug: string }) => result.slug)).toEqual(
      (await repository.listSources()).map((source) => source.slug),
    );
  });

  it("rejects unknown, missing and unsafe concurrency arguments", () => {
    expect(() => parseAuditArgs(["--unknown"])).toThrow("Unknown option");
    expect(() => parseAuditArgs(["--source"])).toThrow("requires a value");
    expect(() => parseAuditArgs(["--concurrency=0"])).toThrow("between 1 and 32");
  });
});
