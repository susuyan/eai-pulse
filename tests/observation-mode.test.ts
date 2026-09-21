import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runObserveSources } from "../src/cli/observe-sources.js";
import * as fetcherModule from "../src/collectors/fetcher.js";
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
      contractFingerprint: "53b2bd337ea7bacd0fa1835f9bc8b72c5f8caae5b867cdefaf17e1950fe3793a",
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
    const jobId = await repository.startJob("source-audit");
    await repository.finishJob(jobId, { collected: 1, created: 1, skipped: 0, errors: [] });
    await db
      .updateTable("jobs")
      .set({
        started_at: time.startedAt,
        finished_at: time.finishedAt,
        details_json: JSON.stringify({
          errors: [],
          auditComplete: true,
          expectedSourceCount: 1,
          targetSourceIds: [source.id],
        }),
      })
      .where("id", "=", jobId)
      .execute();
    await repository.insertSourceCheck({
      id: randomUUID(),
      source_id: source.id,
      job_id: jobId,
      status: "healthy",
      adapter: "json-api",
      adapter_version: "1",
      contract_fingerprint: "53b2bd337ea7bacd0fa1835f9bc8b72c5f8caae5b867cdefaf17e1950fe3793a",
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

const deterministicFetcher: NonNullable<
  NonNullable<Parameters<typeof auditSources>[3]>["fetcher"]
> = async (url) => ({
  body: JSON.stringify([
    {
      name: "HoloMotion embodied robot motion dataset release",
      html_url: "https://github.com/HorizonRobotics/HoloMotion/releases/tag/test-only",
      published_at: "2026-09-20T00:00:00Z",
      draft: false,
    },
  ]),
  status: 200,
  headers: new Headers(),
  attemptCount: 1,
  responseBytes: 300,
  finalUrl: url,
});

async function realPriorityAudits() {
  const context = await prioritySetup();
  await context.db.deleteFrom("source_checks").execute();
  await context.db.deleteFrom("jobs").where("type", "=", "source-audit").execute();
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  for (const time of [...fixture.checks].reverse()) {
    vi.setSystemTime(new Date(time.startedAt));
    await auditSources(
      context.db,
      config,
      { sourceId: context.source.id },
      { fetcher: deterministicFetcher },
    );
  }
  vi.setSystemTime(new Date(fixture.now));
  expect(await context.eligibility()).toMatchObject({ eligible: true });
  return { ...context, config };
}

describe("priority draft observation evidence", () => {
  it.each([
    false,
    true,
  ])("rejects missing target evidence after a real check insert failure (cohort=%s)", async (cohort) => {
    const { db, config, repository, source, eligibility } = await realPriorityAudits();
    const other = required(await repository.getSourceByIdOrSlug("internrobotics"));
    const insert = Repository.prototype.insertSourceCheck;
    vi.spyOn(Repository.prototype, "insertSourceCheck").mockImplementation(function (
      this: Repository,
      check,
    ) {
      if (check.source_id === source.id) return Promise.reject(new Error("check write failed"));
      return insert.call(this, check);
    });
    await expect(
      auditSources(
        db,
        config,
        { sourceIds: cohort ? [source.id, other.id] : [source.id] },
        { fetcher: deterministicFetcher },
      ),
    ).rejects.toThrow("Source audit incomplete");
    expect(await repository.listSourceChecks(source.id)).toHaveLength(3);
    if (cohort) expect(await repository.listSourceChecks(other.id)).toHaveLength(1);
    expect(await eligibility()).toMatchObject({ eligible: false });
    await expect(setObservationMode(db, source.id, true)).rejects.toThrow("not eligible");
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("accepts a complete real cohort with a healthy target and another persisted failure", async () => {
    const { db, config, repository, source, eligibility } = await realPriorityAudits();
    const other = required(await repository.getSourceByIdOrSlug("internrobotics"));
    const report = await auditSources(
      db,
      config,
      { sourceIds: [source.id, other.id] },
      {
        fetcher: async (url, options) => ({
          ...(await required(deterministicFetcher)(url, options)),
          ...(url.includes("InternRobotics") ? { body: "{invalid-json" } : {}),
        }),
      },
    );
    expect(report).toMatchObject({ total: 2, healthy: 1, failed: 1 });
    expect(await eligibility()).toMatchObject({ eligible: true });
  });

  it.each([
    "succeeded",
    "partial",
    "running",
    "failed",
  ])("rejects a newer %s job with no target check", async (status) => {
    const { db, repository, source, eligibility } = await realPriorityAudits();
    const jobId = await repository.startJob("source-audit");
    await db
      .updateTable("jobs")
      .set({
        status,
        finished_at: status === "running" ? null : fixture.now,
        details_json: JSON.stringify({
          targetSourceIds: [source.id],
          expectedSourceCount: 1,
          auditComplete: status === "succeeded",
          errors: status === "succeeded" ? [] : ["AUDIT_INCOMPLETE"],
        }),
      })
      .where("id", "=", jobId)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("rejects legacy check jobs without recorded target membership", async () => {
    const { db, eligibility } = await prioritySetup();
    await db
      .updateTable("jobs")
      .set({
        details_json: JSON.stringify({ errors: [], auditComplete: true, expectedSourceCount: 1 }),
      })
      .where("type", "=", "source-audit")
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("blocks a real setup failure without a check, then requires a fresh healthy interval", async () => {
    const { db, config, repository, source, eligibility } = await realPriorityAudits();
    const setupFailure = vi.spyOn(fetcherModule, "createSafeFetcher").mockImplementation(() => {
      throw new Error("test setup failure");
    });
    await expect(auditSources(db, config, { sourceId: source.id })).rejects.toThrow(
      "test setup failure",
    );
    setupFailure.mockRestore();
    expect(await eligibility()).toMatchObject({ eligible: false });
    for (const [index, hour] of ["19", "02", "09"].entries()) {
      vi.setSystemTime(new Date(`2026-09-${index === 0 ? "21" : "22"}T${hour}:00:00Z`));
      await auditSources(db, config, { sourceId: source.id }, { fetcher: deterministicFetcher });
      expect(await eligibility()).toMatchObject({ eligible: index === 2 });
    }
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it("does not block a target for another source's incomplete audit", async () => {
    const { db, config, repository, source, eligibility } = await realPriorityAudits();
    const other = required(await repository.getSourceByIdOrSlug("internrobotics"));
    vi.spyOn(Repository.prototype, "insertSourceCheck").mockRejectedValue(
      new Error("test write failure"),
    );
    await expect(
      auditSources(db, config, { sourceId: other.id }, { fetcher: deterministicFetcher }),
    ).rejects.toThrow("Source audit incomplete");
    expect(await eligibility()).toMatchObject({ eligible: true });
    expect(await repository.getSource(source.id)).toEqual(source);
  });

  it.each([
    { started_at: "invalid", finished_at: fixture.now },
    { started_at: fixture.now, finished_at: "" },
    { started_at: fixture.now, finished_at: "2026-09-22T00:00:00Z" },
    { started_at: fixture.now, finished_at: "2026-09-21T17:59:59Z" },
  ])("rejects corrupt no-check job times: %j", async (times) => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const jobId = await repository.startJob("source-audit", null, { targetSourceIds: [source.id] });
    await db
      .updateTable("jobs")
      .set({ status: "failed", ...times })
      .where("id", "=", jobId)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false, reason: "invalid_job_time" });
  });

  it.each([
    null,
    "a".repeat(64),
  ])("rejects legacy or changed check fingerprints: %s", async (fingerprint) => {
    const { db, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    await db
      .updateTable("source_checks")
      .set({ contract_fingerprint: fingerprint })
      .where("source_id", "=", source.id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("rejects unchanged-version JSON take changes and evidence from an earlier config", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    await repository.updateSource(source.id, {
      config_json: JSON.stringify({ ...JSON.parse(source.config_json), take: 1 }),
    });
    expect(await eligibility()).toMatchObject({ eligible: false });
    await repository.updateSource(source.id, { config_json: source.config_json });
    await db
      .updateTable("source_checks")
      .set({ contract_fingerprint: "b".repeat(64) })
      .where("source_id", "=", source.id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });
  it.each([
    { finished_at: "2026-09-22T00:00:00Z" },
    { finished_at: "not-a-date" },
    { finished_at: "2026-09-21T16:59:59Z" },
    { started_at: "2026-09-21T17:00:01Z" },
    { started_at: "2026-02-30T00:00:00Z" },
    {
      status: "partial",
      error_count: 1,
      error_summary: "AUDIT_INCOMPLETE",
      details_json: JSON.stringify({
        errors: ["AUDIT_INCOMPLETE"],
        auditComplete: false,
        expectedSourceCount: 2,
      }),
    },
  ])("rejects invalid or incomplete job evidence %j", async (patch) => {
    const { db, repository, source, eligibility } = await prioritySetup();
    expect(await eligibility()).toMatchObject({ eligible: true });
    const check = required((await repository.listSourceChecks(source.id))[0]);
    await db
      .updateTable("jobs")
      .set(patch)
      .where("id", "=", required(check.job_id ?? undefined))
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("does not hide an intervening failed check with an empty finish timestamp", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const {
      source_name: _name,
      source_slug: _slug,
      ...check
    } = required((await repository.listSourceChecks(source.id))[0]);
    expect(await eligibility()).toMatchObject({ eligible: true });
    const jobId = await repository.startJob("source-audit", source.id);
    await repository.finishJob(jobId, {
      collected: 1,
      created: 0,
      skipped: 0,
      errors: ["fixture:PARSE_ERROR"],
      details: { auditComplete: true, expectedSourceCount: 1 },
    });
    await db
      .updateTable("jobs")
      .set({ started_at: "2026-09-21T13:00:00Z", finished_at: "2026-09-21T13:00:01Z" })
      .where("id", "=", jobId)
      .execute();
    await repository.insertSourceCheck({
      ...check,
      id: randomUUID(),
      job_id: jobId,
      status: "failed",
      started_at: "2026-09-21T13:00:00Z",
      finished_at: "",
    });
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("permits a completed partial job only when the other source failure is persisted", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const other = required(await repository.getSourceByIdOrSlug("internrobotics"));
    const {
      source_name: _name,
      source_slug: _slug,
      ...check
    } = required((await repository.listSourceChecks(source.id))[0]);
    await repository.insertSourceCheck({
      ...check,
      id: randomUUID(),
      source_id: other.id,
      status: "failed",
      error_code: "PARSER_FAILED",
    });
    const jobId = required(check.job_id ?? undefined);
    await db
      .updateTable("jobs")
      .set({
        status: "partial",
        collected_count: 2,
        error_count: 1,
        error_summary: "internrobotics:PARSER_FAILED",
        details_json: JSON.stringify({
          errors: ["internrobotics:PARSER_FAILED"],
          auditComplete: true,
          expectedSourceCount: 2,
          targetSourceIds: [source.id, other.id],
        }),
      })
      .where("id", "=", jobId)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: true });
    await db
      .updateTable("source_checks")
      .set({ finished_at: "2026-09-22T00:00:00Z" })
      .where("job_id", "=", jobId)
      .where("source_id", "=", other.id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
    await db
      .updateTable("source_checks")
      .set({ finished_at: check.finished_at })
      .where("job_id", "=", jobId)
      .where("source_id", "=", other.id)
      .execute();
    await db
      .deleteFrom("source_checks")
      .where("job_id", "=", jobId)
      .where("source_id", "=", other.id)
      .execute();
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("never verifies a source changed to draft after the automatic snapshot", async () => {
    const { db, repository, source } = await prioritySetup();
    await repository.updateSource(source.id, { lifecycle_status: "shadow" });
    const original = Repository.prototype.listSources;
    vi.spyOn(Repository.prototype, "listSources").mockImplementationOnce(async function (
      this: Repository,
    ) {
      const sources = await original.call(this);
      await db
        .updateTable("sources")
        .set({ lifecycle_status: "draft" })
        .where("id", "=", source.id)
        .execute();
      return sources;
    });
    await expect(autoEnableObservation(db)).rejects.toThrow(/shadow/);
    expect(await repository.getSource(source.id)).toMatchObject({
      lifecycle_status: "draft",
      observation_enabled: 0,
      enabled: 0,
    });
  });
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

  it("reports the latest valid check even when policy rejects before window selection", async () => {
    const { db, repository, source, eligibility } = await prioritySetup();
    const last = required((await repository.listSourceChecks(source.id)).at(-1));
    await db
      .updateTable("source_checks")
      .set({
        started_at: "2026-09-21T17:30:00Z",
        finished_at: "2026-09-21T17:30:01Z",
        status: "failed",
      })
      .where("id", "=", last.id)
      .execute();
    required(contracts[0]).policy.status = "pending";
    expect(await eligibility()).toMatchObject({
      eligible: false,
      reason: "policy_pending",
      latestStatus: "failed",
    });
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
    const moved = await db
      .selectFrom("source_checks")
      .selectAll()
      .where("source_id", "=", source.id)
      .where("started_at", "=", "2026-09-21T12:00:00Z")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("jobs")
      .set({ started_at: moved.started_at, finished_at: moved.finished_at })
      .where("id", "=", required(moved.job_id ?? undefined))
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
    for (const check of await repository.listSourceChecks(source.id)) {
      await db
        .updateTable("jobs")
        .set({ started_at: check.started_at, finished_at: check.finished_at })
        .where("id", "=", required(check.job_id ?? undefined))
        .execute();
    }
    vi.setSystemTime(new Date("2026-09-22T17:00:01.000Z"));
    expect(await eligibility()).toMatchObject({ eligible: true });
    vi.setSystemTime(new Date("2026-09-22T17:00:01.001Z"));
    expect(await eligibility()).toMatchObject({ eligible: false });
  });

  it("consumes checks produced by the real audit and adapter using deterministic transport", async () => {
    const { repository, source, eligibility } = await realPriorityAudits();
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
