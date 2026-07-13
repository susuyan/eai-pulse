import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const dailyBriefMarker = (date: string) => `<!-- agent-pulse-daily-brief:${date} -->`;

interface DailyEvent {
  slug: string;
  title: string;
  happenedAt: string;
  category: string;
  factSummary: string;
  industryInsight: string;
  futureOutlook: string;
  evidence?: Array<{ publishedAt?: string }>;
}

interface DailyScout {
  title: string;
  kind: string;
  hypothesis: string;
  suggestedAction: string;
  confidenceScore: number;
  publishedAt: string;
}

interface DailyBriefInput {
  timeline: { generatedAt?: string; events: DailyEvent[] };
  scout: { insights: DailyScout[] };
  product: {
    version?: string;
    evaluation?: { overallScore?: number; evidenceCoverage?: number } | null;
  };
  siteUrl?: string;
}

export function renderDailyBrief(
  input: DailyBriefInput,
  date: string,
  timeZone = "Asia/Shanghai",
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Daily brief date must be YYYY-MM-DD");
  const events = input.timeline.events
    .filter((event) => eventDate(event, timeZone) === date)
    .sort((left, right) => right.happenedAt.localeCompare(left.happenedAt));
  const research = events.filter((event) => ["research", "paper"].includes(event.category));
  const changes = events.filter((event) => !research.includes(event));
  const scout = input.scout.insights
    .filter((insight) => zonedDate(insight.publishedAt, timeZone) === date)
    .sort(
      (left, right) =>
        right.confidenceScore - left.confidenceScore || left.title.localeCompare(right.title),
    );
  const siteUrl = input.siteUrl ?? "https://barretlee.github.io/agent-pulse/";
  const lines = [
    dailyBriefMarker(date),
    `# Agent Pulse AI 日报 · ${date}`,
    "",
    `> 从当天公开快照自动生成：${changes.length} 个行业变化、${research.length} 篇研究、${scout.length} 条行动参考。不是新闻列表，而是可核验的变化与下一步。`,
    "",
    `[打开 Agent Pulse 完整版](${siteUrl})`,
    "",
    "## 今天最值得关注的变化",
    "",
  ];
  if (!changes.length)
    lines.push("今天尚无通过公开门禁的新事件；Issue 会在下一次增量构建时自动更新。");
  for (const [index, event] of changes.slice(0, 12).entries()) {
    lines.push(
      `### ${index + 1}. [${safe(event.title, 140)}](${eventUrl(siteUrl, event.slug)})`,
      "",
      `- **事实**：${safe(event.factSummary, 360)}`,
      `- **为什么重要**：${safe(event.industryInsight, 360)}`,
      `- **下一观察**：${safe(event.futureOutlook, 320)}`,
      "",
    );
  }
  lines.push("## 论文与研究", "");
  if (!research.length) lines.push("当天尚无通过方法、影响与证据门禁的新研究。", "");
  for (const event of research.slice(0, 10)) {
    lines.push(
      `- [${safe(event.title, 150)}](${eventUrl(siteUrl, event.slug)}) — ${safe(event.industryInsight, 280)}`,
    );
  }
  lines.push("", "## 可验证的下一步", "");
  if (!scout.length) lines.push("当天尚无达到置信度与证据门槛的新行动参考。", "");
  for (const insight of scout.slice(0, 10)) {
    lines.push(
      `### ${safe(insight.title, 140)}`,
      "",
      `${safe(insight.hypothesis, 320)}`,
      "",
      `- **建议动作**：${safe(insight.suggestedAction, 320)}`,
      `- **置信度**：${boundedScore(insight.confidenceScore)}/100`,
      "",
    );
  }
  lines.push(
    "## 本次构建",
    "",
    `- 站点版本：${safe(input.product.version ?? "unknown", 30)}`,
    `- 系统评测：${boundedScore(input.product.evaluation?.overallScore)}/100`,
    `- 证据覆盖：${boundedScore(input.product.evaluation?.evidenceCoverage)}%`,
    `- 快照生成：${safe(input.timeline.generatedAt ?? "unknown", 40)}`,
    "",
    "---",
    "此日报由 GitHub Actions 使用公开、隐私安全的静态快照生成，并在同一天持续更新；事实详情与原始来源以站点事件页为准。",
  );
  return `${lines.join("\n")}\n`;
}

export async function runDailyBriefCli(args = process.argv.slice(2)): Promise<void> {
  const timelinePath = requiredValue(args, "--timeline");
  const scoutPath = requiredValue(args, "--scout");
  const productPath = requiredValue(args, "--product");
  const timeZone = valueFor(args, "--time-zone") ?? "Asia/Shanghai";
  const date = valueFor(args, "--date") ?? zonedDate(new Date().toISOString(), timeZone);
  const [timeline, scout, product] = await Promise.all(
    [timelinePath, scoutPath, productPath].map(async (path) =>
      JSON.parse(await readFile(resolve(path), "utf8")),
    ),
  );
  process.stdout.write(renderDailyBrief({ timeline, scout, product }, date, timeZone));
}

function eventDate(event: DailyEvent, timeZone: string): string {
  const latest = [event.happenedAt, ...(event.evidence ?? []).map((item) => item.publishedAt ?? "")]
    .filter(Boolean)
    .sort()
    .at(-1);
  return zonedDate(latest ?? event.happenedAt, timeZone);
}

function zonedDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp: ${value}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function eventUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/?$/, "/")}events/${encodeURIComponent(slug)}/`;
}

function safe(value: string, max: number): string {
  return value
    .replace(/[\r\n<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function boundedScore(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value ?? 0))) : 0;
}

function requiredValue(args: string[], flag: string): string {
  const value = valueFor(args, flag);
  if (!value) throw new Error(`Missing required option: ${flag}`);
  return value;
}

function valueFor(args: string[], flag: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runDailyBriefCli();
