import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import {
  applyEmbodiedDataMigration,
  assertMigrationSnapshotMatchesBaseline,
  planEmbodiedDataMigration,
  readEmbodiedDataMigrationBaseline,
} from "../pipeline/embodied-data-migration.js";

export async function runEmbodiedDataMigrationCli(args = process.argv.slice(2)): Promise<void> {
  const mode = migrationMode(args);
  const config = loadConfig();
  const baselinePath = resolve(
    valueFor(args, "--baseline") ??
      resolve(config.rootDir, "data/migrations/embodied-data-public-switch-baseline.json"),
  );
  const snapshotPath = resolve(
    valueFor(args, "--snapshot") ?? resolve(config.rootDir, "data/snapshot/v1.json"),
  );
  const baseline = await readEmbodiedDataMigrationBaseline(baselinePath);
  const db = createDatabase(config);
  try {
    await migrateToLatest(db, config);
    const result =
      mode === "apply"
        ? await applyVerifiedMigration(db, baseline, snapshotPath)
        : await planEmbodiedDataMigration(db, baseline);
    process.stdout.write(
      `${JSON.stringify({ mode, baselinePath, snapshotPath, ...result }, null, 2)}\n`,
    );
  } finally {
    await db.destroy();
  }
}

function migrationMode(args: string[]): "dry-run" | "apply" {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Usage: npm run migrate:embodied -- <--dry-run|--apply>");
  }
  return apply ? "apply" : "dry-run";
}

async function applyVerifiedMigration(
  db: ReturnType<typeof createDatabase>,
  baseline: Awaited<ReturnType<typeof readEmbodiedDataMigrationBaseline>>,
  snapshotPath: string,
) {
  await assertMigrationSnapshotMatchesBaseline(baseline, snapshotPath);
  return applyEmbodiedDataMigration(db, baseline);
}

function valueFor(args: string[], flag: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await runEmbodiedDataMigrationCli();
}
