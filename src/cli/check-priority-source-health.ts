import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../config/env.js";
import {
  PRIORITY_REPORT_PATH,
  priorityReportFreshness,
} from "../pipeline/priority-source-health.js";

const config = loadConfig();
let report: unknown;
try {
  report = JSON.parse(await readFile(resolve(config.rootDir, PRIORITY_REPORT_PATH), "utf8"));
} catch {
  report = undefined;
}
const status = priorityReportFreshness(report);
console.log(
  JSON.stringify({
    status,
    completedAt: status === "invalid" ? null : (report as { completedAt: string }).completedAt,
  }),
);
if (status !== "fresh") process.exitCode = 1;
