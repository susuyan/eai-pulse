import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { down, up } from "../src/db/migrations/018_source_check_contract.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { auditSources } from "../src/pipeline/source-audit.js";

describe("private check contract migration", () => {
  it("round-trips the nullable column without destroying historical checks", async () => {
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
    const db = createDatabase(config);
    try {
      await migrateToLatest(db, config);
      await seedDatabase(db);
      const repository = new Repository(db);
      const source = await repository.getSourceByIdOrSlug("horizon-holomotion");
      if (!source) throw new Error("Missing fixture source");
      await auditSources(
        db,
        config,
        { sourceId: source.id },
        { adapterFor: () => ({ kind: "fixture", collect: async () => [] }) },
      );
      const before = await db.selectFrom("source_checks").select(["id", "status"]).execute();
      expect(before).toHaveLength(1);
      await down(db);
      expect(
        (await db.introspection.getTables())
          .find((table) => table.name === "source_checks")
          ?.columns.some((column) => column.name === "contract_fingerprint"),
      ).toBe(false);
      expect(await db.selectFrom("source_checks").select(["id", "status"]).execute()).toEqual(
        before,
      );
      await up(db);
      expect(await db.selectFrom("source_checks").select("contract_fingerprint").execute()).toEqual(
        [{ contract_fingerprint: null }],
      );
    } finally {
      await db.destroy();
    }
  });
});
