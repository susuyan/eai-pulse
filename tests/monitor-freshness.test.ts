import { describe, expect, it } from "vitest";
import { evaluateVersionedFreshness } from "../src/pipeline/evaluation-policy.js";

describe("versioned evaluation freshness", () => {
  it("stays critical when checkout mtime is fresh but the report is old", () => {
    expect(
      evaluateVersionedFreshness({
        evaluationAsOf: "2026-09-17T11:59:59.000Z",
        fileMtime: "2026-09-20T11:59:59.000Z",
        now: new Date("2026-09-20T12:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "critical",
      detail: {
        evaluationAsOf: "2026-09-17T11:59:59.000Z",
        fileMtime: "2026-09-20T11:59:59.000Z",
        ageMinutes: 4_320,
        reasonCode: "evaluation_persistently_stale",
      },
    });
  });

  it("stays healthy when the report is fresh but checkout mtime is old", () => {
    expect(
      evaluateVersionedFreshness({
        evaluationAsOf: "2026-09-20T11:30:00.000Z",
        fileMtime: "2026-08-26T12:00:00.000Z",
        now: new Date("2026-09-20T12:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "ok",
      detail: {
        evaluationAsOf: "2026-09-20T11:30:00.000Z",
        fileMtime: "2026-08-26T12:00:00.000Z",
        ageMinutes: 30,
      },
    });
  });
});
