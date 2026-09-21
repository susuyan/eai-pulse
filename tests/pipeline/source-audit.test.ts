import { afterEach, describe, expect, it, vi } from "vitest";
import * as fetcherModule from "../../src/collectors/fetcher.js";
import { createSafeFetcher, FetchError } from "../../src/collectors/fetcher.js";
import type { SourceAdapter } from "../../src/collectors/types.js";
import { loadConfig } from "../../src/config/env.js";
import { createDatabase } from "../../src/db/database.js";
import { migrateToLatest } from "../../src/db/migrate.js";
import { Repository } from "../../src/db/repository.js";
import { seedDatabase } from "../../src/db/seed.js";
import type { CollectedSignal } from "../../src/domain/types.js";
import { generateMonitorReport } from "../../src/pipeline/monitor.js";
import { auditSources } from "../../src/pipeline/source-audit.js";

const databases: ReturnType<typeof createDatabase>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (databases.length) await databases.pop()?.destroy();
});

async function setup() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return { db, config, repository: new Repository(db) };
}

async function setupCohort() {
  const context = await setup();
  const template = await context.repository.getSourceByIdOrSlug("openai");
  if (!template) throw new Error("Missing source fixture");
  const sources = ["a", "b", "c"].map((slug) => ({
    ...template,
    id: `audit-${slug}`,
    slug,
    adapter: "json-api",
    acquisition: "api",
    maintenance_status: "candidate",
    config_json: JSON.stringify({ url: `https://${slug}.example.com/feed` }),
    state_json: JSON.stringify({
      cursor: `${slug}-cursor`,
      etag: `${slug}-etag`,
      lastModified: "Mon, 01 Jun 2026 00:00:00 GMT",
      fingerprint: `${slug}-fingerprint`,
      custom: { checkpoint: 42 },
    }),
  }));
  await context.db.insertInto("sources").values(sources).execute();
  vi.spyOn(Repository.prototype, "listSources").mockResolvedValue([...sources].reverse());
  return { ...context, sources };
}

describe("source audit", () => {
  it("audits the selected cohort in request order, isolates parsing failure, and preserves every source state", async () => {
    const { db, config, repository, sources } = await setupCohort();
    const requests: string[] = [];
    const completed: string[] = [];
    let releaseFirst = () => {};
    const lastStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fetcher = createSafeFetcher(config, {
      validateUrl: async () => undefined,
      fetchImpl: async (input) => {
        const slug = new URL(String(input)).hostname.split(".")[0] as string;
        requests.push(slug);
        if (slug === "a") await lastStarted;
        if (slug === "c") releaseFirst();
        completed.push(slug);
        return new Response(
          slug === "b"
            ? "{malformed-json"
            : JSON.stringify([
                signal(`https://${slug}.example.com/release`, "Robot dataset release"),
              ]),
          { headers: { etag: "new-etag", "last-modified": "Mon, 21 Sep 2026 00:00:00 GMT" } },
        );
      },
    });
    const report = await auditSources(
      db,
      config,
      { sourceIds: ["audit-a", "audit-b", "audit-c", "audit-a"], concurrency: 2 },
      { fetcher },
    );
    expect(requests).toEqual(["a", "b", "c"]);
    expect(completed).toEqual(["b", "c", "a"]);
    expect(report).toMatchObject({ total: 3, healthy: 2, failed: 1 });
    expect(report.results.map(({ slug, status }) => ({ slug, status }))).toEqual([
      { slug: "a", status: "healthy" },
      { slug: "b", status: "failed" },
      { slug: "c", status: "healthy" },
    ]);
    for (const source of sources) {
      const checks = await repository.listSourceChecks(source.id);
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({
        job_id: report.jobId,
        status: source.slug === "b" ? "failed" : "healthy",
      });
      expect(await repository.getSource(source.id)).toEqual(source);
    }
    expect((await repository.listSourceChecks("audit-b"))[0]).toMatchObject({
      parse_status: "failed",
      http_status: 200,
      item_count: 0,
    });
    expect((await repository.listJobs()).find((job) => job.id === report.jobId)).toMatchObject({
      status: "partial",
      collected_count: 3,
      created_count: 2,
      error_count: 1,
      finished_at: expect.any(String),
      source_id: null,
    });
  });

  it("rejects an unknown selected ID before starting any source or job", async () => {
    const { db, config, repository } = await setupCohort();
    const beforeJobs = await repository.listJobs();
    const attempted: string[] = [];
    await expect(
      auditSources(
        db,
        config,
        { sourceIds: ["audit-a", "missing", "audit-c"] },
        {
          fetcher: async () => {
            throw new Error("Unexpected network request");
          },
          adapterFor: () => ({
            kind: "fixture",
            collect: async (source) => {
              attempted.push(source.slug);
              return [];
            },
          }),
        },
      ),
    ).rejects.toThrow("missing");
    expect(attempted).toEqual([]);
    expect(await repository.listJobs()).toEqual(beforeJobs);
    expect(await repository.listSourceChecks()).toEqual([]);
  });

  it("finishes a job as failed when shared runtime setup throws", async () => {
    const { db, config, repository } = await setupCohort();
    vi.spyOn(fetcherModule, "createSafeFetcher").mockImplementation(() => {
      throw new Error("fetch setup failed");
    });
    await expect(auditSources(db, config, { sourceId: "audit-a" })).rejects.toThrow(
      "fetch setup failed",
    );
    const job = (await repository.listJobs()).find((row) => row.type === "source-audit");
    expect(job).toMatchObject({
      status: "failed",
      finished_at: expect.any(String),
      error_count: 1,
    });
    expect(await repository.listSourceChecks()).toEqual([]);
  });

  it("drains other workers and records partial counts before rejecting a check persistence failure", async () => {
    const { db, config, repository } = await setupCohort();
    const insert = Repository.prototype.insertSourceCheck;
    vi.spyOn(Repository.prototype, "insertSourceCheck").mockImplementation(function (
      this: Repository,
      check,
    ) {
      if (check.source_id === "audit-b") return Promise.reject(new Error("check write failed"));
      return insert.call(this, check);
    });
    const completed: string[] = [];
    let releaseFirst = () => {};
    const lastStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await expect(
      auditSources(
        db,
        config,
        {
          sourceIds: ["audit-a", "audit-b", "audit-c"],
          concurrency: 2,
        },
        {
          fetcher: async () => {
            throw new Error("Unexpected network request");
          },
          adapterFor: () => ({
            kind: "fixture",
            collect: async (source) => {
              if (source.slug === "a") await lastStarted;
              if (source.slug === "c") releaseFirst();
              completed.push(source.slug);
              return [
                signal(`https://${source.slug}.example.com/release`, "Robot dataset release"),
              ];
            },
          }),
        },
      ),
    ).rejects.toThrow("audit");
    expect(completed).toEqual(["b", "c", "a"]);
    expect((await repository.listSourceChecks()).map((check) => check.source_slug).sort()).toEqual([
      "a",
      "c",
    ]);
    expect((await repository.listJobs()).find((row) => row.type === "source-audit")).toMatchObject({
      status: "partial",
      collected_count: 2,
      created_count: 2,
      error_count: 1,
      finished_at: expect.any(String),
    });
  });

  it("rejects finalization failure instead of returning a successful report", async () => {
    const { db, config, repository } = await setupCohort();
    vi.spyOn(Repository.prototype, "finishJob").mockRejectedValue(new Error("job write failed"));
    await expect(
      auditSources(
        db,
        config,
        { sourceId: "audit-a" },
        {
          adapterFor: () => ({
            kind: "fixture",
            collect: async () => [signal("https://example.com/release", "Robot dataset release")],
          }),
        },
      ),
    ).rejects.toThrow("job write failed");
    expect(await repository.listSourceChecks("audit-a")).toHaveLength(1);
  });

  it("retains both setup and finalization errors when neither operation succeeds", async () => {
    const { db, config } = await setupCohort();
    const setupError = new Error("fetch setup failed");
    const finishError = new Error("job write failed");
    vi.spyOn(fetcherModule, "createSafeFetcher").mockImplementation(() => {
      throw setupError;
    });
    vi.spyOn(Repository.prototype, "finishJob").mockRejectedValue(finishError);
    await expect(auditSources(db, config, { sourceId: "audit-a" })).rejects.toMatchObject({
      errors: [setupError, finishError],
    });
  });

  it("continues a sequential cohort after a network failure and persists all three checks", async () => {
    const { db, config, repository, sources } = await setupCohort();
    const attempted: string[] = [];
    const report = await auditSources(
      db,
      config,
      {
        sourceIds: ["audit-a", "audit-b", "audit-c"],
        concurrency: 1,
      },
      {
        adapterFor: () => ({
          kind: "fixture",
          collect: async (source) => {
            attempted.push(source.slug);
            if (source.slug === "b")
              throw new FetchError("connection reset", "network", true, null, "ECONNRESET");
            return [signal(`https://${source.slug}.example.com/release`, "Robot dataset release")];
          },
        }),
      },
    );
    expect(attempted).toEqual(["a", "b", "c"]);
    expect(report.results.map((result) => result.status)).toEqual(["healthy", "failed", "healthy"]);
    expect(report.results[1]).toMatchObject({ errorType: "network", errorCode: "ECONNRESET" });
    expect(await repository.listSourceChecks()).toHaveLength(3);
    for (const source of sources) expect(await repository.getSource(source.id)).toEqual(source);
    expect((await repository.listJobs()).find((job) => job.id === report.jobId)).toMatchObject({
      status: "partial",
      finished_at: expect.any(String),
      collected_count: 3,
    });
  });

  it("paces concurrent same-domain sources, listings and all details through one rate budget", async () => {
    const { db, config, repository } = await setup();
    const rows = (await repository.listSources()).slice(0, 2).map((row, index) => ({
      ...row,
      adapter: "web-scraper",
      acquisition: "html",
      maintenance_status: "candidate",
      rate_limit_per_minute: 30,
      config_json: JSON.stringify({
        url: `https://example.com/list/${index}`,
        html: {
          records: ".record",
          title: { selector: "a" },
          link: { selector: "a", attribute: "href" },
          detail: {
            take: 3,
            title: { selector: "h1" },
            date: { selector: "time", format: "ymd", semantic: "published" },
          },
        },
      }),
    }));
    vi.spyOn(Repository.prototype, "listSources").mockResolvedValue(rows);
    const requests: Array<{ url: string; at: number }> = [];
    const safeFetch = createSafeFetcher(config, {
      validateUrl: async () => undefined,
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push({ url, at: Date.now() });
        const body = url.includes("/list/")
          ? [1, 2, 3]
              .map(
                (id) =>
                  `<div class="record"><a href="/detail/${id}">Real robot dataset update ${id}</a></div>`,
              )
              .join("")
          : "<h1>Real robot dataset update with collection quality metadata</h1><time>2026-09-17</time>";
        return new Response(body, { status: 200 });
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
    const start = Date.now();
    const audit = auditSources(db, config, { concurrency: 2 }, { fetcher: safeFetch });
    await vi.runAllTimersAsync();
    const report = await audit;
    expect(report.results.map((result) => result.itemCount)).toEqual([3, 3]);
    expect(requests).toHaveLength(8);
    expect(requests.map((request) => request.at - start)).toEqual([
      0, 2000, 4000, 6000, 8000, 10000, 12000, 14000,
    ]);
    expect(requests.filter((request) => request.url.includes("/list/"))).toHaveLength(2);
    expect(requests.filter((request) => request.url.includes("/detail/"))).toHaveLength(6);
  });
  it("persists structured diagnostics without activating or writing signals", async () => {
    const { db, config, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "openai");
    expect(source).toBeTruthy();
    const beforeSignals = await db
      .selectFrom("signals")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    const beforeLifecycle = source?.lifecycle_status;
    const items = [
      signal("https://example.com/release", "Frontier model release"),
      signal("https://example.com/release", "Frontier model release"),
      signal("https://example.com/product", "New enterprise product"),
    ];
    const adapter: SourceAdapter = { kind: "fixture", collect: async () => items };

    const report = await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      { adapterFor: () => adapter },
    );

    expect(report).toMatchObject({ total: 1, healthy: 1, withContent: 1 });
    expect(report.results[0]).toMatchObject({ itemCount: 3, duplicateRatio: 1 / 3 });
    const checks = await repository.listSourceChecks(source?.id ?? "missing");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      status: "healthy",
      item_count: 3,
      duplicate_count: 1,
      policy_status: "allowed_metadata",
    });
    const monitor = await generateMonitorReport(db);
    expect(monitor).toMatchObject({
      checkedSources: 1,
      healthyCheckedSources: 1,
      skippedCheckedSources: 0,
      repairableCheckedSources: 0,
      auditHealthyPercent: 100,
      automatableHealthyPercent: 100,
    });
    const after = await repository.getSource(source?.id ?? "");
    expect(after?.lifecycle_status).toBe(beforeLifecycle);
    const afterSignals = await db
      .selectFrom("signals")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(afterSignals.count)).toBe(Number(beforeSignals.count));
  });

  it("records restricted sources without requesting them", async () => {
    const { db, config, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.acquisition === "social");
    expect(source).toBeTruthy();
    let adapterCalled = false;

    const report = await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      {
        adapterFor: () => {
          adapterCalled = true;
          throw new Error("must not be called");
        },
      },
    );

    expect(adapterCalled).toBe(false);
    expect(report.results[0]).toMatchObject({
      status: "skipped",
      accessStatus: "not_checked",
      policyStatus: "restricted",
      retentionDecision: "keep_restricted",
    });
  });

  it("classifies a source failure without aborting the audit job", async () => {
    const { db, config, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "openai");
    expect(source).toBeTruthy();
    const adapter: SourceAdapter = {
      kind: "fixture",
      collect: async () => {
        throw new FetchError("connection reset", "network", true, null, "ECONNRESET");
      },
    };

    const report = await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      { adapterFor: () => adapter },
    );

    expect(report).toMatchObject({ total: 1, failed: 1 });
    expect(report.results[0]).toMatchObject({
      errorType: "network",
      errorCode: "ECONNRESET",
      repairAction: "verify_network_dns_or_proxy",
      proxyHint: "possible",
    });
    const job = (await repository.listJobs()).find((item) => item.id === report.jobId);
    expect(job?.status).toBe("failed");
  });

  it("does not mark relative or malformed item URLs as healthy", async () => {
    const { db, config, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "openai");
    const invalid = signal("/relative-release", "Relative release link");
    const adapter: SourceAdapter = { kind: "fixture", collect: async () => [invalid] };

    const report = await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      { adapterFor: () => adapter },
    );

    expect(report.results[0]).toMatchObject({
      status: "failed",
      schemaStatus: "invalid",
      itemCount: 0,
      errorCode: "INVALID_ITEMS",
      repairAction: "repair_item_normalization",
    });
  });

  it("records proxy fallback without storing proxy configuration", async () => {
    const { db, config, repository } = await setup();
    const source = (await repository.listSources()).find((item) => item.slug === "openai");
    const adapter: SourceAdapter = {
      kind: "fixture",
      collect: async (_descriptor, context) => {
        await context.fetchText("https://example.com/feed");
        return [signal("https://example.com/release", "Proxy-backed release")];
      },
    };
    const fetcher = async () => ({
      body: "fixture",
      status: 200,
      headers: new Headers({ "content-type": "text/plain" }),
      attemptCount: 1,
      responseBytes: 7,
      finalUrl: "https://example.com/feed",
      transport: "env-proxy" as const,
    });

    const report = await auditSources(
      db,
      config,
      { sourceId: source?.id ?? "missing" },
      { adapterFor: () => adapter, fetcher },
    );

    expect(report.results[0]).toMatchObject({ proxyUsed: true, proxyHint: "required" });
    expect((await repository.listSourceChecks(source?.id ?? "missing"))[0]).toMatchObject({
      proxy_used: 1,
      proxy_hint: "required",
    });
    expect(JSON.stringify(report)).not.toContain("HTTP_PROXY");
  });
});

function signal(url: string, title: string): CollectedSignal {
  return {
    url,
    title,
    summary:
      "A sufficiently detailed first-party summary used to validate richness and structured source diagnostics.",
    author: "Official team",
    language: "en",
    publishedAt: new Date().toISOString(),
    category: "model-release",
    tags: ["model", "release", "official"],
    metrics: {},
    rawMeta: {},
  };
}
