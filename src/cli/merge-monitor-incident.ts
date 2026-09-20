import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type MonitorIncidentContext,
  mergeEvaluationIncidentBody,
} from "../pipeline/monitor-alert.js";

async function main(args = process.argv.slice(2)): Promise<void> {
  const incidentPath = requiredValue(args, "--incident");
  const sectionPath = requiredValue(args, "--section");
  const outputPath = requiredValue(args, "--output");
  const fingerprint = requiredValue(args, "--fingerprint");
  const incidents = JSON.parse(
    await readFile(resolve(incidentPath), "utf8"),
  ) as MonitorIncidentContext[];
  const section = await readFile(resolve(sectionPath), "utf8");
  const body = mergeEvaluationIncidentBody(incidents[0]?.body ?? "", section, fingerprint);
  await writeFile(resolve(outputPath), body, "utf8");
}

function requiredValue(args: string[], name: string): string {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  const index = args.indexOf(name);
  const value = inline?.slice(name.length + 1) ?? (index >= 0 ? args[index + 1] : undefined);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
