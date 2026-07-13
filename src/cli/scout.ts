import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { runScout } from "../pipeline/scout.js";

export async function runScoutCli(args = process.argv.slice(2)): Promise<void> {
  const rawLimit = args[0] ?? "3";
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 18) {
    throw new Error("Scout limit must be an integer between 1 and 18");
  }
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    await migrateToLatest(db, config);
    console.log(JSON.stringify(await runScout(db, limit), null, 2));
  } finally {
    await db.destroy();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runScoutCli();
