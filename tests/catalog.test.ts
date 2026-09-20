import { describe, expect, it } from "vitest";
import {
  embodiedSourceCatalog,
  embodiedSourceSlugs,
  legacySourcePolicy,
} from "../src/catalog/embodied-data/sources.js";
import { sourceCatalog } from "../src/catalog/sources.js";
import { hasAdapter } from "../src/collectors/index.js";
import contractCases from "./fixtures/embodied-data/launch/source-contract-cases.json" with {
  type: "json",
};

describe("embodied data source catalog", () => {
  it("is the only current catalog and is shadow-first", () => {
    expect(sourceCatalog).toEqual(embodiedSourceCatalog);
    expect(sourceCatalog.length).toBeGreaterThanOrEqual(30);
    expect(new Set(sourceCatalog.map((source) => source.slug)).size).toBe(sourceCatalog.length);
    expect(embodiedSourceSlugs).toEqual(new Set(sourceCatalog.map((source) => source.slug)));

    for (const source of sourceCatalog) {
      expect(source.enabled).toBe(false);
      expect(["draft", "shadow"]).toContain(source.lifecycleStatus);
      expect(source.owner.length).toBeGreaterThan(1);
      expect(source.robotsPolicy.length).toBeGreaterThan(10);
      expect(source.freshnessSloHours).toBeGreaterThan(0);
      expect(source.adapterVersion).toMatch(/^\d+$/);
      expect(source.licenseNote.length).toBeGreaterThan(20);
      expect(hasAdapter(source.adapter)).toBe(true);
      expect(new URL(source.homepageUrl).protocol).toBe("https:");
      expect(new URL(source.endpoint).protocol).toBe("https:");
    }
  });

  it("covers robot teams, data services, tools, datasets, standards and peer evidence", () => {
    expect(new Set(sourceCatalog.map((source) => source.category))).toEqual(
      new Set([
        "robot-team",
        "data-service",
        "capture-tool",
        "dataset-benchmark",
        "standard-policy",
        "peer-evidence",
      ]),
    );
    expect(sourceCatalog.filter((source) => source.region === "CN").length).toBeGreaterThanOrEqual(
      10,
    );
    expect(
      sourceCatalog.filter((source) => source.category === "dataset-benchmark").length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("matches the reviewed launch source contract cases", () => {
    for (const contract of contractCases) {
      expect(sourceCatalog.find((source) => source.slug === contract.slug)).toMatchObject({
        category: contract.category,
        adapter: contract.adapter,
        region: contract.region,
        lifecycleStatus: "shadow",
        enabled: false,
      });
    }
  });

  it("defines a fail-closed retirement policy for legacy sources", () => {
    expect(legacySourcePolicy).toEqual({
      contentScope: "legacy-ai",
      enabled: false,
      observationEnabled: false,
      lifecycleStatus: "retired",
      maintenanceStatus: "retired",
    });
  });
});
