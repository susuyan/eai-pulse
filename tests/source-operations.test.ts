import { describe, expect, it } from "vitest";
import { embodiedPrioritySourceSlugs } from "../src/catalog/embodied-data/priority-sources.js";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { seedDatabase } from "../src/db/seed.js";
import { observationEligibility, setObservationMode } from "../src/pipeline/observation.js";
import { activationQualification } from "../src/pipeline/source-operations.js";

describe("source operation readiness", () => {
  it("keeps all twelve sources ineligible before live evidence without mutating sources", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      const before = await db
        .selectFrom("sources")
        .selectAll()
        .where("slug", "in", embodiedPrioritySourceSlugs)
        .execute();
      const eligibility = (await observationEligibility(db)).filter((row) =>
        embodiedPrioritySourceSlugs.includes(row.slug),
      );
      expect(eligibility).toHaveLength(12);
      for (const row of eligibility) {
        const reason =
          row.slug === "figure-ai"
            ? "policy_restricted"
            : row.slug === "nist-physical-ai"
              ? "missing_check"
              : "policy_pending";
        expect(row).toMatchObject({
          eligible: false,
          reason,
          observationEnabled: false,
        });
        await expect(setObservationMode(db, row.sourceId, true)).rejects.toThrow(reason);
      }
      expect(
        await db
          .selectFrom("sources")
          .selectAll()
          .where("slug", "in", embodiedPrioritySourceSlugs)
          .execute(),
      ).toEqual(before);
    } finally {
      await db.destroy();
    }
  });
  it("requires a healthy latest check, 20 healthy checks and seven observation days", () => {
    const now = Date.now();
    const checks = Array.from({ length: 20 }, (_, index) => ({
      status: "healthy",
      finished_at: new Date(now - index * 12 * 60 * 60 * 1_000).toISOString(),
    }));

    expect(activationQualification(checks)).toMatchObject({
      allowed: true,
      healthyChecks: 20,
      observationDays: 9,
      reason: null,
    });
    expect(activationQualification(checks.slice(0, 19))).toMatchObject({
      allowed: false,
      reason: "healthy_checks_below_20",
    });
    const first = checks[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("missing generated source check");
    expect(activationQualification([{ ...first, status: "failed" }, ...checks])).toMatchObject({
      allowed: false,
      reason: "latest_check_not_healthy",
    });
  });
});
