import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const weeklyBriefMarker = (week: string) => `<!-- agent-pulse-weekly-brief:${week} -->`;

interface WeeklyEvent {
  slug: string;
  title: string;
  happenedAt: string;
  category: string;
  factSummary: string;
  industryInsight: string;
  futureOutlook: string;
  impactScore?: number;
  valueScore?: number;
  evidence?: Array<{ source?: string; publishedAt?: string }>;
  tracks?: Array<{ slug: string; name: string }>;
}

interface WeeklyScout {
  title: string;
  hypothesis: string;
  suggestedAction: string;
  counterSignals?: string;
  confidenceScore: number;
  publishedAt: string;
}

interface WeeklyBriefInput {
  timeline: { generatedAt?: string; events: WeeklyEvent[] };
  scout: { insights: WeeklyScout[] };
  product: {
    version?: string;
    evaluation?: { overallScore?: number; evidenceCoverage?: number } | null;
    sourceCoverage?: { total?: number; active?: number; observing?: number };
  };
  siteUrl?: string;
}

const strategicTracks = [
  ["tech-evolution", "模型能力与研究"],
  ["agi-progress", "Agent 与软件重构"],
  ["commercialization", "产品与商业验证"],
  ["model-economics", "基础设施与成本"],
  ["investing", "资本与公司演化"],
  ["global-innovation", "全球创新版图"],
] as const;

export function renderWeeklyBrief(
  input: WeeklyBriefInput,
  endDate: string,
  timeZone = "Asia/Shanghai",
): string {
  const window = isoWeekWindow(endDate);
  const events = input.timeline.events
    .filter((event) => {
      const date = eventDate(event, timeZone);
      return date >= window.start && date <= window.end;
    })
    .sort(
      (left, right) =>
        (right.impactScore ?? 0) - (left.impactScore ?? 0) ||
        (right.valueScore ?? 0) - (left.valueScore ?? 0) ||
        right.happenedAt.localeCompare(left.happenedAt),
    );
  const research = events.filter((event) => ["research", "paper"].includes(event.category));
  const scout = input.scout.insights
    .filter((item) => {
      const date = zonedDate(item.publishedAt, timeZone);
      return date >= window.start && date <= window.end;
    })
    .sort((left, right) => right.confidenceScore - left.confidenceScore);
  const sourceCount = new Set(
    events.flatMap((event) => event.evidence?.map((item) => item.source).filter(Boolean) ?? []),
  ).size;
  const siteUrl = input.siteUrl ?? "https://barretlee.github.io/agent-pulse/";
  const leadingEvents = events.slice(0, 3);
  const actions = selectActionableScouts(scout, 3);
  const affectedTracks = new Set(events.flatMap(eventTrackNames));
  const unchangedTracks = strategicTracks.length - affectedTracks.size;
  const judgment = events.length
    ? `需要更新。${safe(events[0]?.industryInsight ?? events[0]?.factSummary ?? "", 180)}`
    : "保持不变。本周没有足以改变当前判断的新证据。";
  const lines = [
    weeklyBriefMarker(window.week),
    `# Agent Pulse AI 周报 · ${window.week}`,
    "",
    `> **一句话判断：${judgment}**`,
    "",
    `**周期** ${window.start}—${window.end} · **新增变化** ${events.length} · **事实信源** ${sourceCount} · **研究** ${research.length}`,
    "",
    `[查看完整站点](${siteUrl}) · [打开趋势判断](${siteUrl.replace(/\/?$/, "/")}lines/)`,
    "",
    "## 本周关键变化",
    "",
  ];

  if (!leadingEvents.length) lines.push("没有新增关键变化。继续沿用上周判断。", "");
  for (const event of leadingEvents) {
    const tracks = eventTrackNames(event);
    lines.push(
      `### [${safe(event.title, 120)}](${eventUrl(siteUrl, event.slug)})`,
      "",
      safe(event.factSummary, 220),
      "",
      `- **影响主线**：${tracks.length ? tracks.join(" / ") : "待归类"}`,
      `- **判断变化**：${safe(event.industryInsight, 240)}`,
      `- **下一观察**：${safe(event.futureOutlook, 240)}`,
      "",
    );
  }
  if (events.length > leadingEvents.length) {
    lines.push(
      `另有 ${events.length - leadingEvents.length} 个变化已进入完整站点，本期只保留最值得判断的 3 个。`,
      "",
    );
  }
  if (unchangedTracks > 0)
    lines.push(`其余 ${unchangedTracks} 条主线本周暂无足以改变判断的新证据。`, "");

  lines.push("## 下周三件事", "");
  if (!actions.length) lines.push("暂无达到公开门槛的新行动建议。", "");
  for (const [index, item] of actions.entries()) {
    const trigger = scoutTrigger(item.title);
    lines.push(
      `${index + 1}. **${scoutLabel(item.title)}**${trigger ? `（${safe(trigger, 52)}）` : ""}`,
      `   ${safe(item.suggestedAction, 220)}`,
    );
  }
  const stopCondition = actions.find((item) => item.counterSignals)?.counterSignals;
  if (stopCondition) lines.push("", `**统一停止条件**：${safe(stopCondition, 220)}`);

  lines.push(
    "",
    "## 仍需验证",
    "",
    research.length
      ? `本周有 ${research.length} 篇研究通过公开门禁；优先核对方法、复现和真实影响。`
      : "本周没有新增研究通过方法、证据与影响门禁。",
    ...uniqueStrings(leadingEvents.map((event) => event.futureOutlook))
      .slice(0, 3)
      .map((item) => `- ${safe(item, 220)}`),
    "",
    "<details>",
    "<summary>数据与覆盖</summary>",
    "",
    `- 站点版本：${safe(input.product.version ?? "unknown", 30)}`,
    `- 系统评测：${boundedScore(input.product.evaluation?.overallScore)}/100`,
    `- 证据覆盖：${boundedScore(input.product.evaluation?.evidenceCoverage)}%`,
    `- 来源目录：${Math.max(0, Math.round(input.product.sourceCoverage?.total ?? 0))} 个；active ${Math.max(0, Math.round(input.product.sourceCoverage?.active ?? 0))}；observing ${Math.max(0, Math.round(input.product.sourceCoverage?.observing ?? 0))}`,
    `- 快照生成：${safe(input.timeline.generatedAt ?? "unknown", 40)}`,
    "",
    "> 来源目录不等于事实证据；具体判断以事件页的原始资料为准。",
    "",
    "</details>",
  );
  return `${lines.join("\n")}\n`;
}

export async function runWeeklyBriefCli(args = process.argv.slice(2)): Promise<void> {
  const timelinePath = requiredValue(args, "--timeline");
  const scoutPath = requiredValue(args, "--scout");
  const productPath = requiredValue(args, "--product");
  const timeZone = valueFor(args, "--time-zone") ?? "Asia/Shanghai";
  const endDate = valueFor(args, "--end-date") ?? zonedDate(new Date().toISOString(), timeZone);
  const [timeline, scout, product] = await Promise.all(
    [timelinePath, scoutPath, productPath].map(async (path) =>
      JSON.parse(await readFile(resolve(path), "utf8")),
    ),
  );
  process.stdout.write(renderWeeklyBrief({ timeline, scout, product }, endDate, timeZone));
}

function isoWeekWindow(date: string): { start: string; end: string; week: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Weekly brief date must be YYYY-MM-DD");
  const current = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(current.valueOf())) throw new Error(`Invalid date: ${date}`);
  const weekday = current.getUTCDay() || 7;
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + yearStart.getUTCDay() + 1) / 7,
  );
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
    week: `${year}-W${String(week).padStart(2, "0")}`,
  };
}

function eventDate(event: WeeklyEvent, timeZone: string): string {
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

function eventTrackNames(event: WeeklyEvent): string[] {
  const names = new Map<string, string>(strategicTracks);
  return uniqueStrings(
    (event.tracks ?? [])
      .map((track) => names.get(track.slug))
      .filter((name): name is string => Boolean(name)),
  );
}

function selectActionableScouts(items: WeeklyScout[], limit: number): WeeklyScout[] {
  const selected: WeeklyScout[] = [];
  const seenTriggers = new Set<string>();
  const seenLabels = new Set<string>();
  const add = (item: WeeklyScout) => {
    if (selected.includes(item) || selected.length >= limit) return;
    selected.push(item);
    const trigger = scoutTrigger(item.title);
    if (trigger) seenTriggers.add(trigger);
    seenLabels.add(scoutLabel(item.title));
  };

  for (const item of items) {
    const trigger = scoutTrigger(item.title);
    if (trigger && !seenTriggers.has(trigger)) add(item);
  }
  for (const item of items) {
    if (!seenLabels.has(scoutLabel(item.title))) add(item);
  }
  for (const item of items) add(item);
  return selected;
}

function scoutTrigger(title: string): string {
  return title.match(/「([^」]+)」/)?.[1]?.trim() ?? "";
}

function scoutLabel(title: string): string {
  const labels: Array<[string, string]> = [
    ["数据或工具资产", "沉淀一个数据或工具资产"],
    ["内部验证", "做一次 7 天内部验证"],
    ["创业入口", "验证一个窄而深的创业入口"],
    ["认知缺口", "补齐一个会改变判断的认知缺口"],
    ["公开观点", "发布一条可持续验证的公开观点"],
    ["判断框架", "沉淀一份可复用判断框架"],
  ];
  return labels.find(([keyword]) => title.includes(keyword))?.[1] ?? safe(title, 48);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
if (process.argv[1] && resolve(process.argv[1]) === currentFile) await runWeeklyBriefCli();
