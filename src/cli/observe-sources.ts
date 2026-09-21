import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import {
  autoEnableObservation,
  observationEligibility,
  setObservationMode,
} from "../pipeline/observation.js";

export async function runObserveSources(args = process.argv.slice(2)): Promise<void> {
  const confirm = args.includes("--confirm");
  const auto = args.includes("--auto");
  const unknown = args.filter((argument) => argument !== "--confirm" && argument !== "--auto");
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);

  const config = loadConfig();
  const db = createDatabase(config);
  try {
    await migrateToLatest(db, config);

    if (auto && confirm) {
      const result = await autoEnableObservation(db);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    let eligibility = await observationEligibility(db);
    if (auto) {
      const shadows = await db
        .selectFrom("sources")
        .select("id")
        .where("lifecycle_status", "=", "shadow")
        .execute();
      const shadowIds = new Set(shadows.map((source) => source.id));
      eligibility = eligibility.filter((item) => shadowIds.has(item.sourceId));
    }
    const toEnable = eligibility.filter((item) => item.eligible && !item.observationEnabled);
    const toDisable = auto
      ? []
      : eligibility.filter((item) => !item.eligible && item.observationEnabled);
    const summary = {
      checked: eligibility.length,
      eligible: eligibility.filter((item) => item.eligible).length,
      alreadyEnabled: eligibility.filter((item) => item.eligible && item.observationEnabled).length,
      toEnable: toEnable.length,
      toDisable: toDisable.length,
      rejectionReasons: Object.fromEntries(
        [...new Set(eligibility.map((item) => item.reason).filter(Boolean))].map((reason) => [
          reason,
          eligibility.filter((item) => item.reason === reason).length,
        ]),
      ),
    };
    if (!confirm) {
      console.log(
        JSON.stringify(
          {
            changed: false,
            summary,
            next: auto
              ? "npm run observe:sources -- --auto --confirm"
              : "npm run observe:sources -- --confirm",
            sample: toEnable.slice(0, 20).map((item) => item.slug),
          },
          null,
          2,
        ),
      );
      return;
    }
    for (const item of toDisable) await setObservationMode(db, item.sourceId, false);
    for (const item of toEnable) await setObservationMode(db, item.sourceId, true);
    console.log(
      JSON.stringify(
        {
          changed: toEnable.length > 0 || toDisable.length > 0,
          enabled: toEnable.map((item) => item.slug),
          disabled: toDisable.map((item) => item.slug),
          summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.destroy();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runObserveSources();
