import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { renderWeeklyBrief, weeklyBriefMarker } from "../src/cli/render-weekly-brief.js";

describe("weekly GitHub Issue brief", () => {
  it("groups the Shanghai ISO week and keeps public markdown safe", () => {
    const body = renderWeeklyBrief(
      {
        timeline: {
          generatedAt: "2026-07-19T13:20:00.000Z",
          events: [
            {
              slug: "weekly-event",
              title: "A | weekly <event>",
              happenedAt: "2026-07-13T03:00:00.000Z",
              category: "product",
              factSummary: "A verified fact",
              industryInsight: "This changes the workflow control point.",
              futureOutlook: "Watch retention and failure recovery.",
              impactScore: 88,
              valueScore: 84,
              evidence: [{ source: "Official Lab", publishedAt: "2026-07-13T03:00:00.000Z" }],
              tracks: [{ slug: "agi-progress", name: "Agent 与软件重构" }],
            },
            {
              slug: "old-event",
              title: "Old",
              happenedAt: "2026-07-05T03:00:00.000Z",
              category: "product",
              factSummary: "Old fact",
              industryInsight: "Old impact",
              futureOutlook: "Old watch",
            },
          ],
        },
        scout: {
          insights: [
            {
              title: "把「A weekly event」沉淀成一个可复用的数据或工具资产",
              hypothesis: "The task can be delegated safely.",
              suggestedAction: "Measure accepted outcomes for seven days.",
              counterSignals: "Manual takeover does not decline.",
              confidenceScore: 82,
              publishedAt: "2026-07-17T08:00:00.000Z",
            },
            {
              title: "围绕「A weekly event」发起一个 7 天内部验证",
              hypothesis: "A real workflow can expose the boundary.",
              suggestedAction: "Run one real workflow with a stop condition.",
              confidenceScore: 81,
              publishedAt: "2026-07-17T08:00:00.000Z",
            },
            {
              title: "从「A second event」验证一个窄而深的创业入口",
              hypothesis: "A narrow customer segment may pay for the result.",
              suggestedAction: "Interview five target users before building.",
              confidenceScore: 80,
              publishedAt: "2026-07-17T08:00:00.000Z",
            },
            {
              title: "围绕「A weekly event」建立一条可持续验证的公开观点",
              hypothesis: "Public correction can improve the claim.",
              suggestedAction: "Publish one evidence and counter-signal card.",
              confidenceScore: 79,
              publishedAt: "2026-07-17T08:00:00.000Z",
            },
          ],
        },
        product: {
          version: "0.8.1",
          evaluation: { overallScore: 83, evidenceCoverage: 91 },
          sourceCoverage: { total: 284, active: 18, observing: 31 },
        },
      },
      "2026-07-19",
    );

    expect(body).toContain(weeklyBriefMarker("2026-W29"));
    expect(body).toContain("A weekly event");
    expect(body).not.toContain("<event>");
    expect(body).not.toContain("Old fact");
    expect(body).toContain("Measure accepted outcomes for seven days.");
    expect(body).toContain("来源目录：284 个");
    expect(body).toContain("## 本周关键变化");
    expect(body).toContain("## 下周三件事");
    expect(body).toContain("<summary>数据与覆盖</summary>");
    expect(body).not.toContain("## 本周最值得深读");
    expect(body).not.toContain("· 0 个节点");
    expect(body.match(/^\d\. \*\*/gm)).toHaveLength(3);
    expect(body.split("## 下周三件事")[0]?.match(/A weekly event/g)).toHaveLength(1);
    expect(body.split("\n").length).toBeLessThan(70);
  });

  it("keeps the workflow idempotent and Sunday-gated", async () => {
    const workflow = await readFile(".github/workflows/data-refresh.yml", "utf8");
    expect(workflow).toContain('cron: "17 12 * * *"');
    expect(workflow).toContain("agent-pulse-weekly-brief");
    expect(workflow).toContain("weekly:issue");
    expect(workflow).toContain("weekly-brief");
    expect(workflow).toContain('"$PUBLISH_WEEKLY" == "true"');
    expect(workflow).toContain('"$weekday" == "7"');
    expect(workflow).toContain('"$hour" -ge 20');
    expect(workflow).toContain("gh issue edit");
    expect(workflow).not.toContain("daily:issue");
    expect(workflow).not.toContain("agent-pulse-daily-brief");
  });

  it("states that the current view remains unchanged when no evidence clears the gate", () => {
    const body = renderWeeklyBrief(
      {
        timeline: { events: [] },
        scout: { insights: [] },
        product: { sourceCoverage: { total: 284, active: 18, observing: 31 } },
      },
      "2026-07-19",
    );

    expect(body).toContain("一句话判断：保持不变");
    expect(body).toContain("继续沿用上周判断");
    expect(body).not.toContain("· 0 个节点");
  });
});
