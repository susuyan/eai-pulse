import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function workflow(name: string) {
  return readFile(`.github/workflows/${name}.yml`, "utf8");
}

function stepScript(content: string, name: string): string {
  const step = content.split(`      - name: ${name}\n`)[1]?.split("\n      - name:")[0];
  const script = step?.split("        run: |\n")[1];
  if (!script) throw new Error(`Missing script: ${name}`);
  return script
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

describe("evaluation recovery workflow contract", () => {
  it("serializes both incident writers without cancelling the active writer", async () => {
    const guard = await workflow("quality-guard");
    const monitor = await workflow("monitor");
    const concurrency = (content: string) =>
      content
        .match(/^concurrency:\n {2}group: ([^\n]+)\n {2}cancel-in-progress: (true|false)/m)
        ?.slice(1);
    expect(concurrency(guard)).toEqual(["agent-pulse-monitor-incident-main", "false"]);
    expect(concurrency(monitor)).toEqual(concurrency(guard));
    for (const content of [guard, monitor]) {
      expect(content).toContain('contains("agent-pulse-monitor:v")');
      expect(content).toContain("--label 'monitor:critical'");
    }
  });

  it.each([
    "queued",
    "in_progress",
    "pending",
    "waiting",
    "requested",
    "unknown_future_state",
  ])("does not dispatch while a main refresh is %s", async (status) => {
    expect(
      await cooldownDecision([
        { status, conclusion: null, createdAt: "2026-09-20T11:00:00Z" },
        { status: "completed", conclusion: "failure", createdAt: "2026-09-20T10:00:00Z" },
      ]),
    ).toContain("dispatch=false");
  });

  it.each([
    ["2026-09-20T11:00:00Z", "success", true, false],
    ["2026-09-15T12:00:00Z", "success", true, true],
    ["2026-09-20T11:00:00Z", "failure", true, true],
    ["2026-09-20T11:00:00Z", "failure", false, false],
  ] as const)("preserves completed-run cooldown and eligibility (%s, %s, %s)", async (createdAt, conclusion, eligible, expected) => {
    expect(
      await cooldownDecision([{ status: "completed", conclusion, createdAt }], eligible),
    ).toContain(`dispatch=${expected}`);
  });

  it("queries all main refresh states and dispatches explicit recovery suppression", async () => {
    const guard = await workflow("quality-guard");
    const cooldown = stepScript(guard, "Check refresh cooldown and active runs");
    const apiCommand = cooldown.match(/gh api[\s\S]*?refresh-run-pages\.json"/)?.[0] ?? "";
    expect(guard).toContain("data-refresh.yml/runs?branch=main&per_page=100");
    expect(apiCommand).toContain("--paginate --slurp");
    expect(apiCommand).not.toContain("--jq");
    expect(cooldown).toContain(
      "jq '[.[].workflow_runs[] | {status, conclusion, createdAt: .created_at}]'",
    );
    expect(cooldown).toContain('"$RUNNER_TEMP/refresh-run-pages.json"');
    expect(guard).toContain("--field mode=incremental --field recovery=true");
    expect(await workflow("data-refresh")).toContain(
      ["RECOVERY: $", "{{ inputs.recovery || false }}"].join(""),
    );
  });

  it.each([
    ["true", "false", false],
    ["true", "true", false],
    ["false", "false", true],
  ])("Sunday weekly publishing respects recovery=%s and explicit publish=%s", async (recovery, publishWeekly, expected) => {
    const directory = await mkdtemp(join(tmpdir(), "weekly-recovery-"));
    directories.push(directory);
    const content = await workflow("data-refresh");
    const script = stepScript(content, "Render an eligible weekly intelligence review");
    execFileSync(
      "bash",
      [
        "-c",
        `
      date() {
        case "$1" in
          +%F) printf '2026-09-20';;
          +%G-W%V) printf '2026-W38';;
          +%u) printf '7';;
          +%H) printf '21';;
          *) return 1;;
        esac
      }
      npm() { printf 'Rendered weekly fixture'; }
      ${script}
    `,
      ],
      {
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_ENV: join(directory, "env"),
          GITHUB_OUTPUT: join(directory, "output"),
          RECOVERY: recovery,
          PUBLISH_WEEKLY: publishWeekly,
        },
        stdio: "pipe",
      },
    );
    const status = JSON.parse(await readFile(join(directory, "weekly-status.json"), "utf8"));
    expect(status.attempted).toBe(expected);
    expect(await readFile(join(directory, "env"), "utf8")).toContain(`publish_weekly=${expected}`);
  });
});

async function cooldownDecision(
  runs: Array<{ status: string; conclusion: string | null; createdAt: string }>,
  eligible = true,
) {
  const directory = await mkdtemp(join(tmpdir(), "refresh-cooldown-"));
  directories.push(directory);
  const runsPath = join(directory, "refresh-runs.json");
  await writeFile(runsPath, JSON.stringify(runs));
  const script = stepScript(
    await workflow("quality-guard"),
    "Check refresh cooldown and active runs",
  );
  const nodeScript = script.match(/<<'NODE'[^\n]*\n([\s\S]*?)\nNODE/)?.[1];
  if (!nodeScript) throw new Error("Missing cooldown decision script");
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `Date.now = () => Date.parse("2026-09-20T12:00:00Z");\n${nodeScript}`,
    ],
    {
      env: {
        ...process.env,
        REFRESH_RUNS_PATH: runsPath,
        REFRESH_ELIGIBLE: String(eligible),
        REFRESH_COOLDOWN_HOURS: "120",
        QUEUED_REFRESH: "{}",
        IN_PROGRESS_REFRESH: "{}",
        LATEST_REFRESH: JSON.stringify(runs.find((run) => run.status === "completed") ?? {}),
      },
      encoding: "utf8",
    },
  );
}
