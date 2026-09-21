import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  embodiedPrioritySources,
  prioritySourceContracts,
} from "../../src/catalog/embodied-data/priority-sources.js";
import { embodiedSourceCatalog } from "../../src/catalog/embodied-data/sources.js";
import { getAdapter } from "../../src/collectors/index.js";
import type { CollectContext } from "../../src/collectors/types.js";
import { loadConfig } from "../../src/config/env.js";
import { createDatabase } from "../../src/db/database.js";
import { migrateToLatest } from "../../src/db/migrate.js";
import { Repository } from "../../src/db/repository.js";
import { seedDatabase } from "../../src/db/seed.js";
import { sourceRowContractFingerprint } from "../../src/domain/source-contract.js";
import type { SourceDescriptor } from "../../src/domain/types.js";

interface Fixture {
  slug: string;
  endpoint: string;
  capturedOn: string;
  adapter: string;
  success: string;
  negative: string;
  expected: { title: string; url: string; publishedAt: string };
  policyStatus: string;
  html?: SourceDescriptor["config"]["html"];
  details?: Array<{ url: string; file: string; negative: string }>;
}
const directory = new URL("../fixtures/sources/embodied-priority/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, directory), "utf8");
const fixtures = () => JSON.parse(read("manifest.json")) as Fixture[];
const descriptor = (slug: string): SourceDescriptor => {
  const entry = embodiedPrioritySources.find((item) => item.slug === slug);
  const source = embodiedSourceCatalog.find((item) => item.slug === slug);
  if (!entry || !source) throw new Error(`Missing catalog source: ${slug}`);
  return {
    ...source,
    id: slug,
    adapter: entry.adapter,
    config: { url: source.endpoint, ...(source.html ? { html: source.html } : {}) },
    state: {},
  };
};
const context = (
  body: string,
  finalUrl: string,
  details: Fixture["details"] = [],
): CollectContext => ({
  config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" }),
  fetchText: async (url) => ({
    body:
      url === finalUrl
        ? body
        : read(details.find((d) => d.url === url)?.file ?? "unexpected-request"),
    status: 200,
    headers: new Headers(),
    attemptCount: 1,
    responseBytes: Buffer.byteLength(body),
    finalUrl: url,
  }),
});

describe("embodied priority fixture contracts", () => {
  it("has exactly the approved 12-source cohort and keeps policy pending", () => {
    expect(
      fixtures()
        .map((fixture) => fixture.slug)
        .sort(),
    ).toEqual(embodiedPrioritySources.map((entry) => entry.slug).sort());
    expect(fixtures()).toHaveLength(12);
    expect(prioritySourceContracts.map((record) => record.slug).sort()).toEqual(
      fixtures()
        .map((record) => record.slug)
        .sort(),
    );
    expect(fixtures().some((fixture) => fixture.slug === "galbot")).toBe(false);
    expect(embodiedSourceCatalog.some((source) => source.slug === "galbot")).toBe(true);
    for (const fixture of fixtures()) {
      const source = embodiedSourceCatalog.find((item) => item.slug === fixture.slug);
      expect(fixture.capturedOn).toBe("2026-09-21");
      expect(fixture.policyStatus).toBe("pending");
      expect(prioritySourceContracts.find((record) => record.slug === fixture.slug)).toMatchObject({
        adapter: fixture.adapter,
        adapterVersion: source?.adapterVersion,
        status: "passed",
        policy: { status: fixture.policyStatus, reviewer: null, reviewedAt: null },
      });
      expect(source?.enabled).toBe(false);
      expect(source?.lifecycleStatus).not.toBe("active");
      expect(source?.robotsPolicy).toMatch(/pending/i);
      expect(source?.html).toEqual(fixture.html);
    }
  });
  it("isolates malformed source payloads without changing another source's results or state", async () => {
    const entries = fixtures();
    const results = await Promise.allSettled(
      entries.map(async (fixture) => {
        const source = descriptor(fixture.slug);
        source.state = { cursor: "unchanged" };
        try {
          return await getAdapter(fixture.adapter).collect(
            source,
            context(
              fixture.slug === "internrobotics" ? "{malformed" : read(fixture.success),
              fixture.endpoint,
              fixture.details,
            ),
          );
        } finally {
          expect(source.state).toEqual({ cursor: "unchanged" });
        }
      }),
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(11);
  });
  for (const fixture of fixtures().filter((entry) => entry.details)) {
    it(`${fixture.slug} fails closed on detail schema drift and retains source state`, async () => {
      const source = descriptor(fixture.slug);
      source.state = { etag: "old", cursor: "unchanged" };
      const details = fixture.details?.map((detail) => ({ ...detail, file: detail.negative }));
      await expect(
        getAdapter(fixture.adapter).collect(
          source,
          context(read(fixture.success), fixture.endpoint, details),
        ),
      ).rejects.toThrow(/no valid dated records/);
      expect(source.state).toEqual({ etag: "old", cursor: "unchanged" });
    });
  }
  it("round-trips reviewed extraction config through SQLite seed and the runtime descriptor", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      const repository = new Repository(db);
      for (const fixture of fixtures()) {
        const row = await repository.getSourceByIdOrSlug(fixture.slug);
        if (!row) throw new Error(`Missing seeded source ${fixture.slug}`);
        const source = repository.toSourceDescriptor(row);
        expect(sourceRowContractFingerprint(row)).toBe(
          prioritySourceContracts.find((record) => record.slug === fixture.slug)
            ?.contractFingerprint,
        );
        expect(source.config.html).toEqual(fixture.html);
        expect(source.config.url).toBe(fixture.endpoint);
        expect(source.adapter).toBe(fixture.adapter);
        const items = await getAdapter(source.adapter).collect(
          source,
          context(read(fixture.success), fixture.endpoint, fixture.details),
        );
        expect(items).toContainEqual(expect.objectContaining(fixture.expected));
      }
    } finally {
      await db.destroy();
    }
  });
  for (const entry of embodiedPrioritySources) {
    it(`${entry.slug} normalizes captured dated items`, async () => {
      const fixture = fixtures().find((item) => item.slug === entry.slug);
      if (!fixture) throw new Error(`Missing fixture: ${entry.slug}`);
      expect(fixture.endpoint).toBe(entry.endpoint);
      const source = descriptor(entry.slug);
      const items = await getAdapter(entry.adapter).collect(
        source,
        context(read(fixture.success), entry.endpoint, fixture.details),
      );
      expect(items.length).toBeGreaterThan(0);
      expect(items).toContainEqual(expect.objectContaining(fixture.expected));
      for (const item of items) {
        expect(item.title.trim()).not.toBe("");
        expect(new URL(item.url).protocol).toBe("https:");
        expect(Number.isFinite(Date.parse(item.publishedAt))).toBe(true);
        expect(item.rawMeta.dateInferred).not.toBe(true);
        if (fixture.html) {
          expect(item.rawMeta.dateSemantic).toBe(
            (fixture.html.date ?? fixture.html.detail?.date)?.semantic,
          );
          expect(item.rawMeta.dateValue).toBeTruthy();
          if (fixture.html.detail?.alternateDate) {
            expect(item.rawMeta.dateConflict).toEqual({
              selected: "发布时间：2026-09-03 13:52 信息来源：标准技术司",
              alternate: "2026-09-04 09:41",
            });
          }
        }
      }
    });
    it(`${entry.slug} rejects drift without inventing dates`, async () => {
      const fixture = fixtures().find((item) => item.slug === entry.slug);
      if (!fixture) throw new Error(`Missing fixture: ${entry.slug}`);
      const result = await getAdapter(entry.adapter)
        .collect(descriptor(entry.slug), context(read(fixture.negative), entry.endpoint))
        .catch(() => []);
      expect(result).toEqual([]);
    });
    it(`${entry.slug} rejects an empty response body`, async () => {
      await expect(
        getAdapter(entry.adapter).collect(descriptor(entry.slug), context("", entry.endpoint)),
      ).rejects.toThrow();
    });
  }
});
