import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { dailyBriefMarker, renderDailyBrief } from "../src/cli/render-daily-brief.js";

describe("daily GitHub Issue brief", () => {
  it("renders only the Shanghai-day increment with decisions and safe markdown", () => {
    const body = renderDailyBrief(
      {
        timeline: {
          generatedAt: "2026-07-13T05:00:00.000Z",
          events: [
            {
              slug: "new-event",
              title: "A | new <event>",
              happenedAt: "2026-07-12T17:30:00.000Z",
              category: "product",
              factSummary: "Fact",
              industryInsight: "Why it matters",
              futureOutlook: "Watch next",
              evidence: [],
            },
            {
              slug: "old-event",
              title: "Old",
              happenedAt: "2026-07-11T00:00:00.000Z",
              category: "product",
              factSummary: "Old fact",
              industryInsight: "Old impact",
              futureOutlook: "Old next",
            },
          ],
        },
        scout: {
          insights: [
            {
              title: "Test the workflow",
              kind: "work",
              hypothesis: "A testable hypothesis",
              suggestedAction: "Run a small experiment",
              confidenceScore: 84,
              publishedAt: "2026-07-13T02:00:00.000Z",
            },
          ],
        },
        product: { version: "0.8.0", evaluation: { overallScore: 81, evidenceCoverage: 93 } },
      },
      "2026-07-13",
    );

    expect(body).toContain(dailyBriefMarker("2026-07-13"));
    expect(body).toContain("A new event");
    expect(body).not.toContain("<event>");
    expect(body).not.toContain("Old fact");
    expect(body).toContain("Run a small experiment");
    expect(body).toContain("系统评测：81/100");
  });

  it("keeps the workflow idempotent and grants issue write permission", async () => {
    const workflow = await readFile(".github/workflows/data-refresh.yml", "utf8");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("agent-pulse-daily-brief");
    expect(workflow).toContain("gh issue edit");
    expect(workflow).toContain("gh issue create");
  });
});
