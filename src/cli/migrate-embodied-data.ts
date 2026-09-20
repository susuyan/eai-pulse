import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { seedDatabase } from "../db/seed.js";
import {
  applyVerifiedEmbodiedDataMigration,
  embodiedPublicFingerprint,
  planEmbodiedDataMigration,
  readEmbodiedDataMigrationBaseline,
} from "../pipeline/embodied-data-migration.js";
import { restoreRepositorySnapshot } from "../pipeline/snapshot.js";

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
        ? await applyVerifiedEmbodiedDataMigration(db, baseline, {
            baselineSnapshotPath: snapshotPath,
            rootDir: config.rootDir,
            relativePath: snapshotPath,
            verifySnapshot: (candidate) => verifyMigrationSnapshot(config, candidate),
          })
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

async function verifyMigrationSnapshot(
  config: ReturnType<typeof loadConfig>,
  candidate: {
    path: string;
    counts: Record<string, number>;
    publicFingerprint: string;
  },
) {
  const verificationRoot = await mkdtemp(join(tmpdir(), "agent-pulse-migration-verify-"));
  const verificationConfig = {
    ...config,
    databaseUrl: `sqlite:${join(verificationRoot, "verification.db")}`,
  };
  const verificationDb = createDatabase(verificationConfig);
  try {
    await migrateToLatest(verificationDb, verificationConfig);
    await seedDatabase(verificationDb);
    const restored = await restoreRepositorySnapshot(
      verificationDb,
      verificationRoot,
      candidate.path,
    );
    if (JSON.stringify(restored.counts) !== JSON.stringify(candidate.counts)) {
      throw new Error("Migration snapshot count mismatch after round-trip restore");
    }
    if ((await embodiedPublicFingerprint(verificationDb)) !== candidate.publicFingerprint) {
      throw new Error("Migration public fingerprint mismatch after round-trip restore");
    }
  } finally {
    await verificationDb.destroy();
    await rm(verificationRoot, { recursive: true, force: true });
  }
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
