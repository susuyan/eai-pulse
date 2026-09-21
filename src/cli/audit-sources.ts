import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embodiedPrioritySourceSlugs } from "../catalog/embodied-data/priority-sources.js";
import { loadConfig } from "../config/env.js";
import { createDatabase } from "../db/database.js";
import { migrateToLatest } from "../db/migrate.js";
import { seedDatabase } from "../db/seed.js";
import { buildPrioritySourceHealthReport } from "../pipeline/priority-source-health.js";
import { auditSources } from "../pipeline/source-audit.js";

export interface AuditCliOptions {
  sourceSlugs: string[];
  concurrency?: number;
  reportPath?: string;
  help: boolean;
  cohort?: "embodied-priority";
  reportOnly?: boolean;
}

export function parseAuditArgs(args: string[]): AuditCliOptions {
  const options: AuditCliOptions = { sourceSlugs: [], help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument) continue;
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    const inlineValue = equals >= 0 ? argument.slice(equals + 1) : undefined;

    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--report-only") {
      if (inlineValue !== undefined) throw new Error("--report-only does not take a value");
      options.reportOnly = true;
      continue;
    }
    if (!["--source", "--cohort", "--concurrency", "--report", "--output"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);

    if (flag === "--source" && !options.sourceSlugs.includes(value))
      options.sourceSlugs.push(value);
    if (flag === "--cohort") {
      if (value !== "embodied-priority") throw new Error("Unknown cohort");
      options.cohort = value;
    }
    if (flag === "--report" || flag === "--output") options.reportPath = value;
    if (flag === "--concurrency") {
      const concurrency = Number(value);
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
        throw new Error("--concurrency must be an integer between 1 and 32");
      }
      options.concurrency = concurrency;
    }
  }
  if (options.cohort && (options.sourceSlugs.length || (options.concurrency ?? 4) > 4))
    throw new Error("Priority cohort requires an exact selection and concurrency at most 4");
  if (options.reportOnly && !options.cohort) throw new Error("--report-only requires a cohort");
  return options;
}

export async function runAuditCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseAuditArgs(args);
  if (options.help) {
    console.log(`Usage: npm run sources:audit -- [options]

  --source <slug>       Audit a configured source; repeat to select a cohort
  --cohort embodied-priority  Audit the exact priority cohort with reviewed policy
  --report-only        Refresh cohort evidence without a new audit
  --concurrency <1-32>  Override bounded audit concurrency
  --report <path>       Write a privacy-safe report below data/reports
  --output <path>       Alias for --report
  --help                Show this help`);
    return;
  }

  const config = loadConfig();
  const db = createDatabase(config);
  try {
    await migrateToLatest(db, config);
    const sourceCount = await db
      .selectFrom("sources")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    if (Number(sourceCount.count) === 0) await seedDatabase(db);

    if (options.reportOnly) {
      const report = await buildPrioritySourceHealthReport(db);
      if (options.reportPath) await writePublicReport(config.rootDir, options.reportPath, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const slugs = options.cohort ? embodiedPrioritySourceSlugs : options.sourceSlugs;
    let sourceIds: string[] | undefined;
    if (slugs.length) {
      const sources = await db
        .selectFrom("sources")
        .select(["id", "slug"])
        .where("slug", "in", slugs)
        .execute();
      const idsBySlug = new Map(sources.map((source) => [source.slug, source.id]));
      sourceIds = slugs.map((slug) => {
        const id = idsBySlug.get(slug);
        if (!id) throw new Error(`Source not found: ${slug}`);
        return id;
      });
    }

    const audit = await auditSources(db, config, {
      ...(sourceIds ? { sourceIds } : {}),
      ...(options.cohort
        ? { concurrency: options.concurrency ?? 4 }
        : options.concurrency
          ? { concurrency: options.concurrency }
          : {}),
    });
    const report = options.cohort
      ? await buildPrioritySourceHealthReport(db)
      : {
          schemaVersion: 1,
          ...audit,
          jobId: undefined,
          results: audit.results.map(({ sourceId: _sourceId, ...result }) => result),
        };
    if (options.reportPath) await writePublicReport(config.rootDir, options.reportPath, report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.destroy();
  }
}

async function writePublicReport(
  rootDir: string,
  reportArgument: string,
  report: unknown,
): Promise<void> {
  const reportsRoot = resolve(rootDir, "data/reports");
  const reportPath = resolve(rootDir, reportArgument);
  const pathWithinReports = relative(reportsRoot, reportPath);
  if (
    !pathWithinReports ||
    pathWithinReports.startsWith("..") ||
    pathWithinReports.includes("../")
  ) {
    throw new Error("Audit reports must be written below data/reports");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await runAuditCli();
}
