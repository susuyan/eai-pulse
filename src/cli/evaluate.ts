import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/env.js";
import { bootstrapRepositoryDatabase } from "../db/bootstrap.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { evaluateSystem } from "../pipeline/evaluate.js";
import {
  type EvaluationContext,
  type EvaluationGateMode,
  parseEvaluationInstant,
} from "../pipeline/evaluation-context.js";
import { decideOperationalEvaluation } from "../pipeline/evaluation-policy.js";
import {
  buildSystemEvaluationReport,
  compareSystemEvaluations,
  normalizeSystemEvaluationReport,
  renderEvaluationSummary,
  type SystemEvaluationReportV2,
} from "../pipeline/evaluation-progress.js";

export interface EvaluationInvocation extends EvaluationContext {
  failOnRegression: boolean;
  legacyFlagUsed: boolean;
}

interface ReadReportResult {
  report: SystemEvaluationReportV2 | null;
  error: string | null;
}

export async function runEvaluateCli(): Promise<void> {
  const args = process.argv.slice(2);
  const runStartedAt = new Date();
  const outputPath = argumentValue(args, "--output");
  const baselinePath = argumentValue(args, "--baseline");
  const summaryPath = argumentValue(args, "--summary");
  const skipBootstrap = args.includes("--skip-bootstrap");
  const baselineResult = baselinePath
    ? await readReport(baselinePath)
    : { report: null, error: null };
  if (baselineResult.error && changeGateRequested(args, baselinePath)) {
    throw new Error(`Cannot read evaluation baseline: ${baselineResult.error}`);
  }
  const invocation = resolveEvaluationInvocation(args, baselineResult.report, runStartedAt);
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    if (skipBootstrap) await migrateToLatest(db, config);
    else await bootstrapRepositoryDatabase(db, config);
    const evaluation = await evaluateSystem(db, invocation);
    const report = buildSystemEvaluationReport(evaluation, invocation);
    const comparison =
      invocation.gateMode === "change" && baselineResult.report
        ? compareSystemEvaluations(report, baselineResult.report)
        : null;
    const operationalDecision =
      invocation.gateMode === "operational"
        ? decideOperationalEvaluation({
            currentScore: report.overallScore,
            persistedEvaluationAsOf: baselineResult.report?.evaluationAsOf ?? null,
            reportValid: baselineResult.report !== null && baselineResult.error === null,
            now: runStartedAt,
          })
        : null;
    const payload = comparison
      ? { ...report, comparison }
      : operationalDecision
        ? { ...report, operationalDecision }
        : report;
    if (outputPath) await atomicWriteJson(outputPath, payload);
    if (summaryPath) {
      const migrationWarning = invocation.legacyFlagUsed
        ? "\n> Migration notice: use `--gate=change`; legacy `--fail-on-regression` inference will be removed in a future release.\n"
        : "";
      await appendFile(
        summaryPath,
        `${renderEvaluationSummary(report, comparison)}${migrationWarning}`,
      );
    }
    console.log(JSON.stringify(payload, null, 2));
    if (invocation.failOnRegression && comparison && !comparison.passed) {
      throw new Error(`System evaluation regression: ${comparison.regressions.join("; ")}`);
    }
  } finally {
    await db.destroy();
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runEvaluateCli();

export function resolveEvaluationInvocation(
  args: string[],
  baseline: SystemEvaluationReportV2 | null,
  runStartedAt: Date,
): EvaluationInvocation {
  const gateArgument = argumentValue(args, "--gate");
  if (gateArgument && gateArgument !== "change" && gateArgument !== "operational") {
    throw new Error(`Unsupported evaluation gate: ${gateArgument}`);
  }
  const baselinePath = argumentValue(args, "--baseline");
  const failOnRegression = args.includes("--fail-on-regression");
  const legacyFlagUsed = !gateArgument && failOnRegression && Boolean(baselinePath);
  const gateMode: EvaluationGateMode =
    gateArgument === "change" || gateArgument === "operational"
      ? gateArgument
      : legacyFlagUsed
        ? "change"
        : "operational";
  const asOfArgument = argumentValue(args, "--as-of");
  const persist = args.includes("--persist");

  if (gateMode === "change") {
    if (!baselinePath || !baseline) {
      throw new Error("Change evaluation gate requires --baseline with a valid report");
    }
    if (asOfArgument) {
      throw new Error("Change evaluation gate cannot override baseline evaluationAsOf");
    }
    if (persist) throw new Error("Change evaluation gate cannot persist evaluation runs");
    return {
      gateMode,
      asOf: parseEvaluationInstant(baseline.evaluationAsOf, "baseline evaluationAsOf"),
      persist: false,
      failOnRegression,
      legacyFlagUsed,
    };
  }

  if (failOnRegression) {
    throw new Error("--fail-on-regression requires --gate=change and --baseline");
  }
  return {
    gateMode,
    asOf: asOfArgument ? parseEvaluationInstant(asOfArgument, "--as-of") : runStartedAt,
    persist,
    failOnRegression: false,
    legacyFlagUsed: false,
  };
}

function argumentValue(args: string[], flag: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function changeGateRequested(args: string[], baselinePath: string | undefined): boolean {
  return (
    argumentValue(args, "--gate") === "change" ||
    (args.includes("--fail-on-regression") && Boolean(baselinePath))
  );
}

async function readReport(path: string): Promise<ReadReportResult> {
  try {
    const serialized = await readFile(path, "utf8");
    return { report: normalizeSystemEvaluationReport(JSON.parse(serialized)), error: null };
  } catch (error) {
    return {
      report: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
