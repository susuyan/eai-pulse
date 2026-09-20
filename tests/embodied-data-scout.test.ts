import { describe, expect, it, vi } from "vitest";
import type { EventRow } from "../src/db/types.js";
import {
  buildScoutCard,
  embodiedScoutKinds,
  scoutPublicationDecision,
} from "../src/pipeline/scout.js";

const event = {
  title: "Robot data factory publishes a verified collection workflow",
  confidence_score: 90,
  heat_score: 85,
  impact_score: 92,
  value_score: 95,
} as EventRow;

describe("embodied data Scout", () => {
  it.each(embodiedScoutKinds)("builds a bounded %s opportunity", (kind) => {
    const card = buildScoutCard(event, kind);
    expect(card).toMatchObject({
      target_audience: expect.any(String),
      why_now: expect.any(String),
      hypothesis: expect.any(String),
      artifact_idea: expect.any(String),
      suggested_action: expect.any(String),
      counter_signals: expect.any(String),
    });
    expect(card.counter_signals).toMatch(/证据|失效|风险/);
  });

  it("fails closed for legacy, review-only, unready, expired, generic, and duplicate triggers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T00:00:00.000Z"));
    const card = buildScoutCard(event, "collection-route");
    const base = {
      ...card,
      eventStatus: "published",
      contentScope: "embodied-data",
      readinessStatus: "ready",
    };
    expect(scoutPublicationDecision({ ...base, eventStatus: "review" }).blockers).toContain(
      "trigger_event_not_published",
    );
    expect(scoutPublicationDecision({ ...base, contentScope: "legacy-ai" }).blockers).toContain(
      "legacy_trigger_event",
    );
    expect(scoutPublicationDecision({ ...base, readinessStatus: "blocked" }).blockers).toContain(
      "trigger_event_not_ready",
    );
    expect(
      scoutPublicationDecision({ ...base, evidenceExpiresAt: "2026-09-19T00:00:00.000Z" }).blockers,
    ).toContain("evidence_expired");
    expect(scoutPublicationDecision({ ...base, genericOpportunity: true }).blockers).toContain(
      "generic_opportunity",
    );
    expect(scoutPublicationDecision({ ...base, duplicateCooldown: true }).blockers).toContain(
      "duplicate_cooldown",
    );
    vi.useRealTimers();
  });
});
