import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { bootstrapRepositoryDatabase } from "../src/db/bootstrap.js";
import { createDatabase } from "../src/db/database.js";
import { evaluateSystem } from "../src/pipeline/evaluate.js";

const AS_OF = new Date("2026-08-26T12:00:00.000Z");
const EXCLUDED = "2026-08-26T12:00:01.000Z";

let db: ReturnType<typeof createDatabase>;

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  db = createDatabase(config);
  await bootstrapRepositoryDatabase(db, config);
});

afterEach(async () => {
  vi.useRealTimers();
  await db.destroy();
});

function scoreState(result: Awaited<ReturnType<typeof evaluateSystem>>) {
  return {
    overallScore: result.overallScore,
    rawWeightedScore: result.rawWeightedScore,
    evidenceCoverage: result.evidenceCoverage,
    dimensions: result.dimensions,
  };
}

describe("point-in-time system evaluation", () => {
  it("keeps scores stable when wall time advances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-26T12:00:02.000Z");
    const first = await evaluateSystem(db, {
      asOf: AS_OF,
      gateMode: "change",
      persist: false,
    });

    vi.setSystemTime("2026-09-20T12:00:02.000Z");
    const second = await evaluateSystem(db, {
      asOf: AS_OF,
      gateMode: "change",
      persist: false,
    });

    expect(scoreState(second)).toEqual(scoreState(first));
  });

  it("excludes evidence created after the reference time", async () => {
    const before = await evaluateSystem(db, {
      asOf: AS_OF,
      gateMode: "change",
      persist: false,
    });
    const source = await db
      .selectFrom("sources")
      .select("id")
      .where("lifecycle_status", "=", "active")
      .executeTakeFirstOrThrow();
    const run = await db
      .selectFrom("source_runs")
      .selectAll()
      .where("finished_at", "is not", null)
      .executeTakeFirstOrThrow();
    const check = await db.selectFrom("source_checks").selectAll().executeTakeFirstOrThrow();
    const event = await db.selectFrom("events").selectAll().executeTakeFirstOrThrow();

    await db
      .insertInto("source_runs")
      .values({
        ...run,
        id: "future-evaluation-run",
        source_id: source.id,
        status: "failed",
        started_at: EXCLUDED,
        finished_at: EXCLUDED,
      })
      .execute();
    await db
      .insertInto("source_checks")
      .values({
        ...check,
        id: "future-evaluation-check",
        source_id: source.id,
        status: "failed",
        started_at: EXCLUDED,
        finished_at: EXCLUDED,
      })
      .execute();
    await db
      .insertInto("events")
      .values({
        ...event,
        id: "future-evaluation-event",
        slug: "future-evaluation-event",
        status: "published",
        happened_at: EXCLUDED,
        published_at: EXCLUDED,
        created_at: EXCLUDED,
        updated_at: EXCLUDED,
      })
      .execute();

    const after = await evaluateSystem(db, {
      asOf: AS_OF,
      gateMode: "change",
      persist: false,
    });

    expect(scoreState(after)).toEqual(scoreState(before));
  });

  it("writes exactly one evaluation run only when persistence is enabled", async () => {
    const before = await db
      .selectFrom("evaluation_runs")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();

    await evaluateSystem(db, { asOf: AS_OF, gateMode: "change", persist: false });
    await evaluateSystem(db, { asOf: AS_OF, gateMode: "change", persist: false });

    const afterReadOnly = await db
      .selectFrom("evaluation_runs")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(afterReadOnly.count).toBe(before.count);

    await evaluateSystem(db, { asOf: AS_OF, gateMode: "operational", persist: true });
    const afterPersisted = await db
      .selectFrom("evaluation_runs")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(afterPersisted.count).toBe(before.count + 1);
  });
});
