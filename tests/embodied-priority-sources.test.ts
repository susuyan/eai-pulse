import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EmbodiedPrioritySource,
  embodiedPrioritySourceSlugs,
  embodiedPrioritySources,
  validateEmbodiedPrioritySources,
} from "../src/catalog/embodied-data/priority-sources.js";
import { embodiedSourceCatalog } from "../src/catalog/embodied-data/sources.js";
import { getAdapter } from "../src/collectors/index.js";
import { EmbodiedPipelineStageSchema } from "../src/domain/embodied-data.js";

afterEach(() => vi.unstubAllGlobals());

const entries = () => embodiedPrioritySources.map((entry) => ({ ...entry }));
const catalog = () => embodiedSourceCatalog.map((source) => ({ ...source }));

describe("embodied priority cohort", () => {
  it("selects a current, unique, China-first cohort with reviewed adapter intent", () => {
    expect(() => validateEmbodiedPrioritySources(catalog(), entries())).not.toThrow();
    expect(embodiedPrioritySources.length).toBeGreaterThanOrEqual(12);
    expect(embodiedPrioritySources.length).toBeLessThanOrEqual(18);
    expect(embodiedPrioritySourceSlugs).toEqual(embodiedPrioritySources.map((entry) => entry.slug));
    expect(new Set(embodiedPrioritySourceSlugs).size).toBe(embodiedPrioritySources.length);
    const selected = embodiedSourceCatalog.filter((source) =>
      embodiedPrioritySourceSlugs.includes(source.slug),
    );
    expect(selected.filter((source) => source.region === "CN").length).toBeGreaterThanOrEqual(6);
    expect(selected.filter((source) => source.region === "GLOBAL").length).toBeGreaterThanOrEqual(
      4,
    );
    expect(new Set(selected.map((source) => source.category)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(selected.flatMap((source) => source.pipelineStages))).toEqual(
      new Set(EmbodiedPipelineStageSchema.options),
    );
    for (const entry of embodiedPrioritySources) {
      expect(getAdapter(entry.adapter).kind).toBe(entry.adapter);
      expect(entry.adapter).not.toBe("manual");
      expect(new URL(entry.endpoint).protocol).toBe("https:");
      expect(entry.adapterVersion.trim()).not.toBe("");
      expect(entry.reviewNote.trim()).not.toBe("");
    }
  });

  it.each([
    ["unknown", { slug: "unknown" }, "unknown"],
    ["manual adapter", { adapter: "manual" }, "adapter"],
    ["unrecognized adapter", { adapter: "unregistered" }, "adapter"],
    ["wrong acquisition", { acquisition: "manual" }, "acquisition"],
    ["wrong version", { adapterVersion: "999" }, "version"],
    ["empty version", { adapterVersion: " " }, "version"],
    ["HTTP endpoint", { endpoint: "http://www.samr.gov.cn/bzjss/" }, "HTTPS"],
    ["unrelated endpoint", { endpoint: "https://unrelated.example/feed" }, "official"],
    ["credentials", { endpoint: "https://user:secret@www.samr.gov.cn/bzjss/" }, "credentials"],
    ["missing review", { reviewNote: " " }, "review"],
    ["invalid review date", { reviewedOn: "not-a-date" }, "review"],
  ])("rejects %s before network access", (_name, change, error) => {
    const fetch = vi.fn(() => {
      throw new Error("Network access is forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const cohort = entries();
    cohort[0] = { ...cohort[0], ...change } as EmbodiedPrioritySource;
    expect(() => validateEmbodiedPrioritySources(catalog(), cohort)).toThrow(error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy scope", { contentScope: "legacy-ai" }, "embodied-data"],
    ["retired lifecycle", { lifecycleStatus: "retired" }, "retired"],
    ["retired maintenance", { maintenanceStatus: "retired" }, "retired"],
    ["restricted map", { mapStatus: "restricted" }, "restricted"],
    ["restricted maintenance", { maintenanceStatus: "restricted" }, "restricted"],
    ["empty catalog version", { adapterVersion: "" }, "version"],
  ])("rejects catalog %s before network access", (_name, change, error) => {
    const fetch = vi.fn(() => {
      throw new Error("Network access is forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const sources = catalog().map((source) =>
      source.slug === embodiedPrioritySources[0]?.slug ? { ...source, ...change } : source,
    );
    expect(() => validateEmbodiedPrioritySources(sources, entries())).toThrow(error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a legacy catalog slug even if it copies current source metadata", () => {
    const cohort = entries();
    const source = catalog()[0];
    if (!source || !cohort[0]) throw new Error("Missing test source");
    cohort[0].slug = "legacy-general-ai";
    expect(() =>
      validateEmbodiedPrioritySources(
        [...catalog(), { ...source, slug: "legacy-general-ai" }],
        cohort,
      ),
    ).toThrow("embodied-data");
  });

  it("rejects duplicate sources", () => {
    const cohort = entries();
    const first = cohort[0];
    if (!first) throw new Error("Missing test source");
    expect(() => validateEmbodiedPrioritySources(catalog(), [...cohort, first])).toThrow(
      "duplicate",
    );
  });

  it.each([0, 11, 19])("rejects a cohort with %i entries", (length) => {
    const all = entries();
    const cohort = [...all, ...all].slice(0, length);
    expect(() => validateEmbodiedPrioritySources(catalog(), cohort)).toThrow(/12.*18/);
  });

  it("reports an unknown singleton before checking minimum coverage", () => {
    const first = entries()[0];
    if (!first) throw new Error("Missing test source");
    expect(() =>
      validateEmbodiedPrioritySources(catalog(), [{ ...first, slug: "unknown" }]),
    ).toThrow("unknown");
  });

  it.each([
    "https://api.github.com/repos/unrelated/InternUtopia/releases",
    "https://github.com/unrelated/InternUtopia",
  ])("rejects another GitHub owner's endpoint: %s", (endpoint) => {
    const cohort = entries().map((entry) =>
      entry.slug === "internrobotics" ? { ...entry, endpoint } : entry,
    );
    expect(() => validateEmbodiedPrioritySources(catalog(), cohort)).toThrow("official");
  });

  it("rejects an impossible review date", () => {
    const cohort = entries().map((entry) => ({ ...entry, reviewedOn: "2026-02-31" }));
    expect(() => validateEmbodiedPrioritySources(catalog(), cohort)).toThrow("review");
  });

  it.each([
    ["China", { region: "GLOBAL" }, "CN"],
    ["global", { region: "CN" }, "GLOBAL"],
    ["categories", { category: "robot-team" as const }, "categories"],
    ["pipeline stages", { pipelineStages: ["acquisition-route" as const] }, "pipeline"],
  ])("rejects insufficient %s coverage", (_name, change, error) => {
    expect(() =>
      validateEmbodiedPrioritySources(
        catalog().map((source) => ({ ...source, ...change })),
        entries(),
      ),
    ).toThrow(error);
  });
});
