import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedSourceCatalog } from "../src/catalog/embodied-data/sources.js";
import { loadConfig } from "../src/config/env.js";
import { bootstrapRepositoryDatabase } from "../src/db/bootstrap.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { exportStaticSite } from "../src/pipeline/export.js";
import { validatePublicSite } from "../src/pipeline/public-site-integrity.js";
import { restoreRepositorySnapshot, writeRepositorySnapshot } from "../src/pipeline/snapshot.js";

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
  it("preserves current source controls while restoring cross-scope history", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-cross-scope-source-"));
    directories.push(root);
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    await db
      .updateTable("sources")
      .set({
        content_scope: "legacy-ai",
        enabled: 1,
        observation_enabled: 1,
        lifecycle_status: "active",
        success_count: 12,
        failure_count: 3,
        state_json: JSON.stringify({ cursor: "legacy-cursor" }),
        last_verified_at: "2026-09-21T00:00:00.000Z",
      })
      .where("slug", "=", "figure-ai")
      .execute();
    await writeRepositorySnapshot(db, root);
    await seedDatabase(db);
    await db
      .updateTable("sources")
      .set({ state_json: "{}", success_count: 0, failure_count: 0 })
      .where("slug", "=", "figure-ai")
      .execute();
    await restoreRepositorySnapshot(db, root);

    expect(
      await db
        .selectFrom("sources")
        .selectAll()
        .where("slug", "=", "figure-ai")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      content_scope: "embodied-data",
      lifecycle_status: "draft",
      enabled: 0,
      observation_enabled: 0,
      success_count: 12,
      failure_count: 3,
      state_json: "{}",
    });
  });

  it("does not reactivate a retired source from repository snapshot state", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-retired-source-"));
    directories.push(root);
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const sourceDb = createDatabase(config);
    const targetDb = createDatabase(config);
    databases.push(sourceDb, targetDb);
    await migrateToLatest(sourceDb, config);
    await seedDatabase(sourceDb);
    await sourceDb
      .updateTable("sources")
      .set({
        content_scope: "embodied-data",
        lifecycle_status: "shadow",
        maintenance_status: "candidate",
      })
      .where("slug", "=", "openai")
      .execute();
    await writeRepositorySnapshot(sourceDb, root);

    await migrateToLatest(targetDb, config);
    await seedDatabase(targetDb);
    await restoreRepositorySnapshot(targetDb, root);

    await expect(
      targetDb
        .selectFrom("sources")
        .select(["content_scope", "lifecycle_status", "maintenance_status"])
        .where("slug", "=", "openai")
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      content_scope: "legacy-ai",
      lifecycle_status: "retired",
      maintenance_status: "retired",
    });
  }, 15_000);

  it("validates the route contract, DTO counts, RSS, and zero legacy leaks", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-integrity-"));
    directories.push(root);
    const base = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const config = { ...base, distDir: join(root, "dist") };
    const db = createDatabase(config);
    databases.push(db);
    await bootstrapRepositoryDatabase(db, config);
    expect(
      await db
        .selectFrom("sources")
        .selectAll()
        .where("slug", "=", "figure-ai")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      content_scope: "embodied-data",
      lifecycle_status: "draft",
      enabled: 0,
      observation_enabled: 0,
    });
    await exportStaticSite(db, config);

    const report = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(report).toMatchObject({
      ok: true,
      counts: {
        events: embodiedLaunchEvents.length,
        pipelineStages: 6,
        datasets: 12,
        standards: 4,
        collectionMethods: 6,
        peers: 15,
        evolutionPhases: 6,
        embodiedTrends: 8,
      },
      issues: [],
    });

    const rss = await readFile(join(config.distDir, "feed.xml"), "utf8");
    const sourcesPage = await readFile(join(config.distDir, "sources/index.html"), "utf8");
    const sources = JSON.parse(
      await readFile(join(config.distDir, "data/sources.json"), "utf8"),
    ) as Array<{
      slug: string;
      lifecycle?: string;
      maintenanceStatus?: string;
      mapStatus?: string;
      pipelineStages?: string[];
    }>;
    const exportedEvents = JSON.parse(
      await readFile(join(config.distDir, "data/events.json"), "utf8"),
    ) as {
      generatedAt?: string;
      events?: Array<{ slug?: string; happenedAt?: string; evidence?: Array<{ url?: string }> }>;
    };
    const events = exportedEvents.events ?? [];
    const evolution = JSON.parse(
      await readFile(join(config.distDir, "data/evolution.json"), "utf8"),
    ) as {
      schemaVersion?: number;
      generatedAt?: string;
      phases?: Array<{
        actorId?: string;
        events?: Array<{ slug?: string; title?: string; role?: string }>;
        stageImpacts?: Record<
          string,
          { events?: Array<{ slug?: string; title?: string; role?: string }> }
        >;
        counterEvents?: Array<{ slug?: string; title?: string; role?: string }>;
      }>;
      trends?: Array<{
        events?: Array<{ slug?: string; title?: string; role?: string }>;
        counterEvents?: Array<{ slug?: string; title?: string; role?: string }>;
      }>;
    };

    expect(sources.length).toBeGreaterThanOrEqual(80);
    expect(sources.length).toBeLessThanOrEqual(100);
    expect(sources.map((source) => source.slug).sort()).toEqual(
      embodiedSourceCatalog.map((source) => source.slug).sort(),
    );
    expect(events).toHaveLength(embodiedLaunchEvents.length);
    expect(evolution.schemaVersion).toBe(1);
    expect(evolution.generatedAt).toBe(exportedEvents.generatedAt);
    expect(evolution.phases).toHaveLength(6);
    expect(evolution.trends).toHaveLength(8);
    expect(JSON.stringify(evolution)).not.toMatch(
      /raw_|private-|\/Users\/|payload_json|config_json|state_json|source_id/i,
    );
    for (const relation of [
      ...(evolution.phases ?? []).flatMap((phase) => [
        ...(phase.events ?? []),
        ...Object.values(phase.stageImpacts ?? {}).flatMap((impact) => impact.events ?? []),
        ...(phase.counterEvents ?? []),
      ]),
      ...(evolution.trends ?? []).flatMap((trend) => [
        ...(trend.events ?? []),
        ...(trend.counterEvents ?? []),
      ]),
    ]) {
      expect(events.some((event) => event.slug === relation.slug)).toBe(true);
    }
    expect(events.some((event) => (event.happenedAt ?? "") >= "2026-08-01T00:00:00.000Z")).toBe(
      true,
    );
    expect(sources.every((source) => source.mapStatus && source.pipelineStages?.length)).toBe(true);
    expect(
      sources.every(
        (source) => source.lifecycle !== "retired" && source.maintenanceStatus !== "retired",
      ),
    ).toBe(true);
    expect(sourcesPage).toContain("已接入");
    expect(sourcesPage).toContain("待接入");
    expect(sourcesPage).toContain("受限");
    expect(sourcesPage).toContain("替代来源");

    expect(rss).toContain('<rss version="2.0"');
    expect(rss.match(/<item>/g)).toHaveLength(embodiedLaunchEvents.length);
    expect(rss).not.toContain("模型价格");
    expect(rss).not.toContain("/lines/");

    const llmsPath = join(config.distDir, "llms.txt");
    const llms = await readFile(llmsPath, "utf8");
    const publicProduct = await readFile(join(config.distDir, "data/product.json"), "utf8");
    const changelog = await readFile(join(config.distDir, "changelog/index.html"), "utf8");
    const privateFieldPattern =
      /"(?:token|secret|password|cookie|authorization|api[_-]?key|raw[_-]?payload|payload_json|config_json|state_json|source_id|restriction_note)"\s*:/i;
    const legacyPattern =
      /\/(?:lines|signals|actors|resources|product|industry-evolution)\/|data\/(?:timeline|tracks|signals|actors|resources|narratives|influencers)\.json|model pricing|模型价格|六个领域趋势|six strategic lines|tech-evolution|agi-progress|commercialization|investing|global-innovation|model-economics|GPT-5\.6/i;
    for (const output of [
      sourcesPage,
      JSON.stringify(sources),
      JSON.stringify(exportedEvents),
      rss,
      changelog,
      publicProduct,
    ]) {
      expect(output).not.toMatch(legacyPattern);
      expect(output).not.toMatch(privateFieldPattern);
    }
    for (const event of events)
      expect(event.evidence?.every((evidence) => evidence.url?.startsWith("https://"))).toBe(true);
    const corruptedEvolution = structuredClone(evolution);
    corruptedEvolution.phases?.[0]?.stageImpacts?.["demand-definition"]?.events?.splice(0, 1, {
      slug: "unknown-embodied-event",
      title: "Unknown event",
      role: "supporting-evidence",
    });
    await writeFile(
      join(config.distDir, "data/evolution.json"),
      `${JSON.stringify(corruptedEvolution)}\n`,
      "utf8",
    );
    const corruptNarrative = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(corruptNarrative.ok).toBe(false);
    expect(corruptNarrative.issues).toContainEqual(
      expect.objectContaining({
        code: "unknown_evolution_event",
        path: "data/evolution.json",
      }),
    );
    const privateEvolution = structuredClone(evolution);
    if (!privateEvolution.phases?.[0]) throw new Error("Evolution fixture is missing a phase");
    privateEvolution.phases[0].actorId = "private-database-id";
    await writeFile(
      join(config.distDir, "data/evolution.json"),
      `${JSON.stringify(privateEvolution)}\n`,
      "utf8",
    );
    const privateNarrative = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(privateNarrative.ok).toBe(false);
    expect(privateNarrative.issues).toContainEqual(
      expect.objectContaining({
        code: "private_evolution_field",
        path: "data/evolution.json",
      }),
    );
    await writeFile(
      join(config.distDir, "data/evolution.json"),
      `${JSON.stringify(evolution)}\n`,
      "utf8",
    );
    await writeFile(llmsPath, `${llms}\nLegacy: /lines/ and model pricing`, "utf8");
    const leaked = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(leaked.ok).toBe(false);
    expect(leaked.issues).toContainEqual(
      expect.objectContaining({ code: "legacy_public_leak", path: "llms.txt" }),
    );
  }, 15_000);

  it("rejects an arbitrary private field nested in an evolution relation", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-evolution-private-note-"));
    directories.push(root);
    const base = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const config = { ...base, distDir: join(root, "dist") };
    const db = createDatabase(config);
    databases.push(db);
    await bootstrapRepositoryDatabase(db, config);
    await exportStaticSite(db, config);

    const evolutionPath = join(config.distDir, "data/evolution.json");
    const evolution = JSON.parse(await readFile(evolutionPath, "utf8")) as {
      phases: Array<{
        stageImpacts: Record<string, { events: Array<Record<string, unknown>> }>;
      }>;
    };
    const relation = evolution.phases[0]?.stageImpacts["demand-definition"]?.events[0];
    if (!relation) throw new Error("Evolution fixture is missing a demand-definition relation");
    relation.privateNote = "private editorial review";
    await writeFile(evolutionPath, `${JSON.stringify(evolution)}\n`, "utf8");

    const report = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "private_evolution_field",
        path: "data/evolution.json",
      }),
    );
  }, 15_000);

  it("rejects an independent evidence endpoint in evolution JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-pulse-evolution-evidence-endpoint-"));
    directories.push(root);
    const base = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const config = { ...base, distDir: join(root, "dist") };
    const db = createDatabase(config);
    databases.push(db);
    await bootstrapRepositoryDatabase(db, config);
    await exportStaticSite(db, config);

    const evolutionPath = join(config.distDir, "data/evolution.json");
    const evolution = JSON.parse(await readFile(evolutionPath, "utf8")) as {
      trends: Array<{ events: Array<Record<string, unknown>> }>;
    };
    const relation = evolution.trends[0]?.events[0];
    if (!relation) throw new Error("Evolution fixture is missing a trend relation");
    relation.sourceEndpoint = "https://private.example.test/evidence";
    await writeFile(evolutionPath, `${JSON.stringify(evolution)}\n`, "utf8");

    const report = await validatePublicSite(config.distDir, "2026-09-20T00:00:00.000Z");
    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "private_evolution_field",
        path: "data/evolution.json",
      }),
    );
  }, 15_000);
});
