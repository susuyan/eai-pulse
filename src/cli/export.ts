import { loadConfig } from "../config/env.js";
import { bootstrapRepositoryDatabase } from "../db/bootstrap.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { exportStaticSite } from "../pipeline/export.js";

const config = loadConfig();
const db = createDatabase(config);
try {
  if (process.argv.includes("--skip-seed")) await migrateToLatest(db, config);
  else await bootstrapRepositoryDatabase(db, config);
  console.log(JSON.stringify(await exportStaticSite(db, config), null, 2));
} finally {
  await db.destroy();
}
