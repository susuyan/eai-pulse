import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { bootstrapRepositoryDatabase } from "../db/bootstrap.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { evaluateSystem } from "../pipeline/evaluate.js";
import {
  buildSystemEvaluationReport,
  compareSystemEvaluations,
  normalizeSystemEvaluationReport,
  renderEvaluationSummary,
  type SystemEvaluationReport,
} from "../pipeline/evaluation-progress.js";

export async function runEvaluateCli(): Promise<void> {
  const runStartedAt = new Date();
  const outputPath = argumentValue("--output");
  const baselinePath = argumentValue("--baseline");
  const summaryPath = argumentValue("--summary");
  const failOnRegression = process.argv.includes("--fail-on-regression");
  const skipBootstrap = process.argv.includes("--skip-bootstrap");
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    if (skipBootstrap) await migrateToLatest(db, config);
    else await bootstrapRepositoryDatabase(db, config);
    const context = {
      asOf: runStartedAt,
      gateMode: "operational",
      persist: true,
    } as const;
    const evaluation = await evaluateSystem(db, context);
    const report = buildSystemEvaluationReport(evaluation, context);
    const baseline = baselinePath ? await readReport(baselinePath) : null;
    const comparison = baseline ? compareSystemEvaluations(report, baseline) : null;
    const payload = comparison ? { ...report, comparison } : report;
    if (outputPath) await atomicWriteJson(outputPath, payload);
    if (summaryPath) await appendFile(summaryPath, renderEvaluationSummary(report, comparison));
    console.log(JSON.stringify(payload, null, 2));
    if (failOnRegression && comparison && !comparison.passed) {
      throw new Error(`System evaluation regression: ${comparison.regressions.join("; ")}`);
    }
  } finally {
    await db.destroy();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runEvaluateCli();

function argumentValue(flag: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readReport(path: string): Promise<SystemEvaluationReport | null> {
  const serialized = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return serialized ? normalizeSystemEvaluationReport(JSON.parse(serialized)) : null;
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
