import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { createDatabase } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrate.js";
import { Repository } from "../src/db/repository.js";
import { seedDatabase } from "../src/db/seed.js";
import { isCurrentEmbodiedSource, planSourceCollection } from "../src/pipeline/collect.js";

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(async () => {
  while (databases.length) await databases.pop()?.destroy();
});

async function setup() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "sqlite::memory:" });
  const db = createDatabase(config);
  databases.push(db);
  await migrateToLatest(db, config);
  await seedDatabase(db);
  return db;
}

describe("collection scope", () => {
  it("selects only observed embodied shadow sources by default", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const [selected, unobserved] = (await repository.listSources())
      .filter(isCurrentEmbodiedSource)
      .slice(0, 2);
    if (!selected || !unobserved) throw new Error("Missing source fixtures");
    await repository.updateSource(selected.id, { observation_enabled: 1 });

    const sources = await repository.listSources();
    const plan = planSourceCollection(sources, "eligible", false);

    expect(plan.sources.map((source) => source.slug)).toEqual([selected.slug]);
    expect(plan.sources.every(isCurrentEmbodiedSource)).toBe(true);
    expect(plan.summary.skippedByReason.not_enabled).toBe(
      sources.filter(isCurrentEmbodiedSource).length - 1,
    );
  });

  it("never collects legacy or retired sources even in diagnostic scope", async () => {
    const db = await setup();
    const repository = new Repository(db);
    const [legacy, retired] = (await repository.listSources())
      .filter(isCurrentEmbodiedSource)
      .slice(0, 2);
    if (!legacy || !retired) throw new Error("Missing source fixtures");
    await repository.updateSource(legacy.id, {
      content_scope: "legacy-ai",
      enabled: 1,
      lifecycle_status: "active",
    });
    await repository.updateSource(retired.id, {
      lifecycle_status: "retired",
      observation_enabled: 1,
    });

    const plan = planSourceCollection(await repository.listSources(), "all", true);

    expect(plan.sources.some((source) => source.id === legacy.id)).toBe(false);
    expect(plan.sources.some((source) => source.id === retired.id)).toBe(false);
    expect(plan.summary.skippedByReason["scope:legacy-ai"]).toBeGreaterThan(0);
    expect(plan.summary.skippedByReason["lifecycle:retired"]).toBe(1);
  });
});
