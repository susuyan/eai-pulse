import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runObserveSources } from "../src/cli/observe-sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import type { SourceCheckRow, SourceRow } from "../src/db/types.js";
import {
  autoEnableObservation,
  observationEligibility,
  setObservationMode,
} from "../src/pipeline/observation.js";
import { auditSources } from "../src/pipeline/source-audit.js";
import { sourceOperationReadiness } from "../src/pipeline/source-operations.js";
import fixture from "./fixtures/embodied-data/priority-source-observation.json" with {
  type: "json",
};

const { contracts } = vi.hoisted(() => ({
  contracts: [
    {
      slug: "horizon-holomotion",
      adapter: "json-api",
      adapterVersion: "1",
      status: "passed",
      policy: {
        status: "allowed_metadata",
        reviewedAt: "2026-09-20T00:00:00.000Z",
        reviewer: "test-only",
        reason: "Synthetic test approval",
      },
    },
  ],
}));
vi.mock("../src/catalog/embodied-data/priority-sources.js", async (original) => ({
  ...(await original<typeof import("../src/catalog/embodied-data/priority-sources.js")>()),
  prioritySourceContracts: contracts,
}));

const databases: ReturnType<typeof createDatabase>[] = [];
const directories: string[] = [];

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing deterministic fixture value");
  return value;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  Object.assign(required(contracts[0]), {
    slug: "horizon-holomotion",
    adapter: "json-api",
    adapterVersion: "1",
    status: "passed",
    policy: {
      status: "allowed_metadata",
      reviewedAt: "2026-09-20T00:00:00.000Z",
      reviewer: "test-only",
      reason: "Synthetic test approval",
    },
  });
  while (databases.length) await databases.pop()?.destroy();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

async function prioritySetup(fileBacked = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(fixture.now));
  let databaseUrl = "sqlite::memory:";
  if (fileBacked) {
    const directory = await mkdtemp(join(tmpdir(), "observation-gate-"));
    directories.push(directory);
    databaseUrl = `sqlite:${join(directory, "test.db")}`;
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("NODE_ENV", "test");
  }
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  const repository = new Repository(db);
  const source = await repository.getSourceByIdOrSlug(fixture.sourceSlug);
  if (!source) throw new Error("Missing test source");
  for (const time of fixture.checks) {
    const jobId = await repository.startJob("source-audit", source.id);
    await repository.finishJob(jobId, { collected: 1, created: 1, skipped: 0, errors: [] });
    await repository.insertSourceCheck({
      id: randomUUID(),
      source_id: source.id,
      job_id: jobId,
      status: "healthy",
      adapter: "json-api",
      adapter_version: "1",
      access_status: "reachable",
      fetch_status: "succeeded",
      parse_status: "succeeded",
      schema_status: "valid",
      policy_status: "allowed_metadata",
      http_status: 200,
      final_url: null,
      content_type: "application/json",
      response_bytes: 100,
      item_count: 3,
      duplicate_count: 0,
      duplicate_ratio_bps: 0,
      quality_score: 80,
      latest_item_at: "2026-09-20T00:00:00.000Z",
      freshness_hours: 24,
      error_type: null,
      error_code: null,
      error_summary: null,
      repair_action: "observe_in_shadow",
      proxy_hint: "not_required",
      retention_decision: "keep",
      recommended_lifecycle: "shadow",
      sample_json: "[]",
      started_at: time.startedAt,
      finished_at: time.finishedAt,
      duration_ms: 1000,
    });
  }
  const eligibility = async () =>
    (await observationEligibility(db)).find((item) => item.sourceId === source.id);
  return { db, repository, source, eligibility };
}

describe("priority draft observation evidence", () => {
  it("accepts three separated healthy audits and exposes draft observe readiness", async () => {
    const { db, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true, reason: null });
    expect((await sourceOperationReadiness(db)).get(source.id)?.observe.allowed).toBe(true);
  });

  it.each([1, 2])("rejects only %i healthy checks", async (count) => {
    const { db, source, eligibility } = await prioritySetup();
    const rows = await new Repository(db).listSourceChecks(source.id);
    await db
      .deleteFrom("source_checks")
      .where(
        "id",
        "in",
        rows.slice(count).map((row) => row.id),
      )
      .execute();
    expect(await eligibility()).toMatchObject({
      eligible: false,
      reason: "healthy_window_below_3_checks",
    });
  });

  it.each<[string, Partial<SourceCheckRow>]>([
    ["zero parsed items", { item_count: 0 }],
    ["schema drift", { schema_status: "partial" }],
    ["degradation", { status: "degraded" }],
    ["duplicate threshold", { duplicate_ratio_bps: 8000 }],
    ["low quality", { quality_score: 59 }],
    ["HTTP failure", { http_status: 503 }],
    ["missing HTTP evidence", { http_status: null }],
    ["not modified", { http_status: 304 }],
    ["parse failure", { parse_status: "failed" }],
    ["fetch failure", { fetch_status: "failed" }],
    ["unreviewed check", { policy_status: "pending" }],
    ["prior version", { adapter_version: "0" }],
    ["prior adapter", { adapter: "rss" }],
    ["no audit job", { job_id: null }],
    ["recorded error", { error_code: "SCHEMA_DRIFT" }],
    ["old content", { freshness_hours: 2161 }],
  ])("rejects %s inside the candidate window", async (_name, patch) => {
    const { db, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    const checks = await new Repository(db).listSourceChecks(source.id);
    await db
      .updateTable("source_checks")
      .set(patch)
      .where("id", "=", required(checks[1]).id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it.each<[string, Partial<SourceRow>]>([
    ["legacy scope", { content_scope: "legacy-ai" }],
    ["restricted map", { map_status: "restricted" }],
    ["restricted maintenance", { maintenance_status: "restricted" }],
    ["retired", { lifecycle_status: "retired" }],
    ["runtime version change", { adapter_version: "2" }],
    ["runtime adapter change", { adapter: "rss" }],
    ["unknown cohort source", { slug: "unlisted-priority-source" }],
  ])("rejects %s", async (_name, patch) => {
    const { db, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    await db.updateTable("sources").set(patch).where("id", "=", source.id).execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it.each([
    "pending",
    "restricted",
  ])("rejects %s policy even with allowed check metadata", async (status) => {
    const { eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    required(contracts[0]).policy.status = status;
    expect(await eligibility()).toMatchObject({ eligible: false, reason: `policy_${status}` });
  });

  it("rejects missing policy review and failed or mismatched fixture contracts", async () => {
    const { eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    required(contracts[0]).policy.reviewer = "";
    expect(await eligibility()).toMatchObject({ eligible: false });
    required(contracts[0]).policy.reviewer = "test-only";
    required(contracts[0]).status = "failed";
    expect(await eligibility()).toMatchObject({ eligible: false });
    required(contracts[0]).status = "passed";
    required(contracts[0]).adapterVersion = "2";
    expect(await eligibility()).toMatchObject({ eligible: false });
    required(contracts[0]).adapterVersion = "1";
    required(contracts[0]).slug = "missing-contract";
    expect(await eligibility()).toMatchObject({
      eligible: false,
      reason: "missing_priority_contract",
    });
  });

  it("rejects stale or future latest success and an insufficient interval", async () => {
    const { db, source, eligibility } = await prioritySetup();
    vi.setSystemTime(new Date("2026-09-22T17:00:01.001Z"));
    expect(await eligibility()).toMatchObject({ eligible: false, reason: "latest_check_stale" });
    vi.setSystemTime(new Date("2026-09-21T16:00:00Z"));
    expect(await eligibility()).toMatchObject({ eligible: false });
    vi.setSystemTime(new Date(fixture.now));
    await db
      .updateTable("source_checks")
      .set({ started_at: "2026-09-21T12:00:00Z", finished_at: "2026-09-21T12:00:01Z" })
      .where("source_id", "=", source.id)
      .where("started_at", "=", required(fixture.checks[1]).startedAt)
      .execute();
    expect(await eligibility()).toMatchObject({
      eligible: false,
      reason: "healthy_window_below_3_checks",
    });
  });

  it("does not skip an intervening failed check to reuse older successes", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const original = required((await repository.listSourceChecks(source.id))[0]);
    const { source_name: _name, source_slug: _slug, ...check } = original;
    await repository.insertSourceCheck({
      ...check,
      id: randomUUID(),
      status: "failed",
      started_at: "2026-09-21T13:00:00Z",
      finished_at: "2026-09-21T13:00:01Z",
    });
    expect(await eligibility()).toMatchObject({ eligible: false });
    expect(
      (
        await db
          .selectFrom("sources")
          .select("lifecycle_status")
          .where("id", "=", source.id)
          .executeTakeFirst()
      )?.lifecycle_status,
    ).toBe("draft");
  });

  it("rejects reused audit jobs and accepts exact six-hour and 24-hour boundaries", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const checks = await repository.listSourceChecks(source.id);
    const first = required(checks[0]);
    const second = required(checks[1]);
    const third = required(checks[2]);
    await db
      .updateTable("source_checks")
      .set({ job_id: first.job_id })
      .where("id", "=", second.id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
    await db
      .updateTable("source_checks")
      .set({
        job_id: second.job_id,
        started_at: "2026-09-21T10:59:59.000Z",
        finished_at: "2026-09-21T11:00:00.000Z",
      })
      .where("id", "=", second.id)
      .execute();
    await db
      .updateTable("source_checks")
      .set({ started_at: "2026-09-21T04:59:58.000Z", finished_at: "2026-09-21T04:59:59.000Z" })
      .where("id", "=", third.id)
      .execute();
    vi.setSystemTime(new Date("2026-09-22T17:00:01.000Z"));
    expect(await eligibility()).toMatchObject({ eligible: true });
    vi.setSystemTime(new Date("2026-09-22T17:00:01.001Z"));
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("consumes checks produced by the real audit and adapter using deterministic transport", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    await db.deleteFrom("source_checks").where("source_id", "=", source.id).execute();
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    for (const time of [...fixture.checks].reverse()) {
      vi.setSystemTime(new Date(time.startedAt));
      await auditSources(
        db,
        config,
        { sourceId: source.id },
        {
          fetcher: async (url) => ({
            body: JSON.stringify([
              {
                name: "HoloMotion embodied robot motion dataset release",
                html_url: "https://github.com/HorizonRobotics/HoloMotion/releases/tag/test-only",
                published_at: "2026-09-20T00:00:00Z",
                draft: false,
                body: "Official embodied robot motion dataset release with verified capture configuration, quality validation, training procedure and documented evaluation results for robotics research.",
              },
            ]),
            status: 200,
            headers: new Headers(),
            attemptCount: 1,
            responseBytes: 300,
            finalUrl: url,
          }),
        },
      );
    }
    vi.setSystemTime(new Date(fixture.now));
    expect(await eligibility()).toMatchObject({ eligible: true });
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("atomically verifies draft, enables shadow, and retains checks and audit history", async () => {
    const { db, repository, source } = await prioritySetup();
    const checks = await repository.listSourceChecks(source.id);
    await setObservationMode(db, source.id, true);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "shadow",
      observation_enabled: 1,
      enabled: 0,
      state_json: source.state_json,
    });
    expect(await repository.listSourceChecks(source.id)).toEqual(checks);
    await setObservationMode(db, source.id, true);
    await setObservationMode(db, source.id, false);
    const history = await db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "observation_mode")
      .execute();
    expect(history).toHaveLength(2);
    expect(JSON.parse(required(history[0]).details_json)).toMatchObject({
      from: "draft",
      to: "shadow",
      action: "verify",
      observationEnabled: true,
    });
    expect(JSON.parse(required(history[0]).details_json).checkIds).toHaveLength(3);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "shadow",
      observation_enabled: 0,
    });
  });

  it("rolls back transition and enablement if audit persistence fails", async () => {
    const { db, repository, source } = await prioritySetup();
    await sql`CREATE TRIGGER reject_observation_audit BEFORE INSERT ON jobs WHEN NEW.type = 'observation_mode' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END`.execute(
      db,
    );
    await expect(setObservationMode(db, source.id, true)).rejects.toThrow("test audit failure");
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("keeps automatic enablement from verifying draft sources", async () => {
    const { db, repository, source } = await prioritySetup();
    await autoEnableObservation(db);
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("repairs an already enabled draft through verification before returning success", async () => {
    const { db, repository, source } = await prioritySetup();
    await repository.updateSource(source.id, { observation_enabled: 1 });
    await setObservationMode(db, source.id, true);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "shadow",
      observation_enabled: 1,
      enabled: 0,
    });
  });

  it("requires CLI confirmation and persists shadow only on confirmed invocation", async () => {
    const { db, repository, source } = await prioritySetup(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runObserveSources([]);
    expect(await repository.getSource(source.id)).toEqual(source);
    await runObserveSources(["--auto"]);
    expect(await repository.getSource(source.id)).toEqual(source);
    await runObserveSources(["--confirm"]);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "shadow",
      observation_enabled: 1,
      enabled: 0,
    });
    expect(
      await db.selectFrom("jobs").selectAll().where("type", "=", "observation_mode").execute(),
    ).toHaveLength(1);
  });

  it("previews automatic shadow enablement without writing and then enables on confirmation", async () => {
    const { repository, source } = await prioritySetup(true);
    await repository.updateSource(source.id, { lifecycle_status: "shadow" });
    const before = await repository.getSource(source.id);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runObserveSources(["--auto"]);
    expect(await repository.getSource(source.id)).toEqual(before);
    expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({
      changed: false,
      next: "npm run observe:sources -- --auto --confirm",
    });
    await runObserveSources(["--auto", "--confirm"]);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "shadow",
      observation_enabled: 1,
      enabled: 0,
    });
  });
});

describe("shadow observation mode", () => {
  it("enables scheduled collection only after a healthy content-bearing check", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    databases.push(db);
    await migrateToLatest(db, config);
    await seedDatabase(db);
    const repository = new Repository(db);
    const source = (await repository.listSources()).find(
      (item) => item.slug === "nvidia-isaac-lab",
    );
    expect(source?.lifecycle_status).toBe("shadow");

    await expect(setObservationMode(db, source?.id ?? "missing", true)).rejects.toThrow(
      "missing_check",
    );
    await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      {
        adapterFor: () => ({
          kind: "fixture",
          collect: async () => [
            {
              url: "https://machinelearning.apple.com/research/fixture",
              title: "Apple releases a verified fixture model",
              summary:
                "A detailed official research release used to prove shadow observation eligibility.",
              language: "en",
              publishedAt: "2026-07-12T00:00:00.000Z",
              category: "model-release",
              tags: ["model", "release", "research"],
              metrics: {},
              rawMeta: {},
            },
          ],
        }),
      },
    );

    const eligible = (await observationEligibility(db)).find(
      (item) => item.sourceId === source?.id,
    );
    expect(eligible).toMatchObject({ eligible: true, latestStatus: "healthy", itemCount: 1 });
    await setObservationMode(db, source?.id ?? "missing", true);
    expect((await repository.getSource(source?.id ?? "missing"))?.observation_enabled).toBe(1);
    expect((await repository.getEnabledSources()).some((item) => item.id === source?.id)).toBe(
      true,
    );
  });
});
