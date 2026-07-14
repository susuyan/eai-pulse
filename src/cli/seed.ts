import { loadConfig } from "../config/env.js";
import { bootstrapRepositoryDatabase } from "../db/bootstrap.js";
import { createDatabase } from "../db/database.js";

const config = loadConfig();
const db = createDatabase(config);
try {
  const snapshot = await bootstrapRepositoryDatabase(db, config);
  console.log(
    `[db] seed and snapshot restore complete: ${snapshot.counts.sources} sources, ${snapshot.counts.signals} signals`,
  );
} finally {
  await db.destroy();
}
