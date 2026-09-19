import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { bootstrapRepositoryDatabase } from "../db/bootstrap.js";
import { createDatabase } from "../db/database.js";
import { buildEmbodiedDataPreview } from "../pipeline/embodied-data-preview.js";

export async function runEmbodiedDataPreviewCli(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config);
  const outputPath = resolve(config.rootDir, "var", "embodied-data-preview.json");
  try {
    await bootstrapRepositoryDatabase(db, config);
    const preview = await buildEmbodiedDataPreview(db);
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(preview, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, outputPath);
    console.log(JSON.stringify({ outputPath, counts: preview.counts }, null, 2));
  } finally {
    await db.destroy();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await runEmbodiedDataPreviewCli();
}
