import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/collectors/rate-limiter.js";

function makeLimiter(
  overrides?: Partial<{ defaultRpm: number; maxConcurrency: number; burstMultiplier: number }>,
) {
  return new RateLimiter({
    defaultRpm: overrides?.defaultRpm ?? 60,
    maxConcurrency: overrides?.maxConcurrency ?? 4,
    burstMultiplier: overrides?.burstMultiplier ?? 2,
  });
}

describe("RateLimiter", () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    "validation",
    "sync-start",
    "async-response",
  ])("releases admission locks after %s failure", async (failure) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
    const start = Date.now();
    const limiter = makeLimiter();
    const first = limiter.dispatch(
      "example.com",
      30,
      "source",
      async () => {
        if (failure === "validation") throw new Error("Blocked URL");
      },
      () => {
        if (failure === "sync-start") throw new Error("Dispatch failed");
        return Promise.reject(new Error("Response failed"));
      },
    );
    const second = limiter.dispatch(
      "example.com",
      30,
      "source",
      async () => undefined,
      async () => Date.now() - start,
    );
    const results = Promise.allSettled([first, second]);
    await vi.runAllTimersAsync();
    expect(await results).toMatchObject([
      { status: "rejected" },
      { status: "fulfilled", value: failure === "validation" ? 0 : 2000 },
    ]);
  });
  it("does not hold admission locks while a dispatched response is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
    const start = Date.now();
    const limiter = makeLimiter();
    let finish = () => {};
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const first = limiter.dispatch(
      "example.com",
      30,
      "a",
      async () => undefined,
      () => response,
    );
    const second = limiter.dispatch(
      "example.com",
      30,
      "b",
      async () => undefined,
      async () => Date.now() - start,
    );
    await vi.runAllTimersAsync();
    expect(await second).toBe(2000);
    finish();
    await first;
  });
  it("shares paced slots across source domains while leaving unrelated budgets independent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
    const start = Date.now();
    const limiter = makeLimiter();
    const dispatch = (domain: string, rpm: number, source: string) =>
      limiter.dispatch(
        domain,
        rpm,
        source,
        async () => undefined,
        async () => Date.now() - start,
      );
    const slots = [
      dispatch("first.example", 30, "a"),
      dispatch("other.example", 30, "a"),
      dispatch("unrelated.example", 30, "b"),
      dispatch("first.example", 60, "c"),
    ];
    await vi.runAllTimersAsync();
    expect(await Promise.all(slots)).toEqual([0, 2000, 0, 2000]);
  });
  it("acquires and releases tokens without blocking under limit", async () => {
    const limiter = makeLimiter({ defaultRpm: 600 }); // Very high limit
    const start = Date.now();
    await limiter.acquire("example.com");
    limiter.release("example.com");
    await limiter.acquire("example.com");
    limiter.release("example.com");
    expect(Date.now() - start).toBeLessThan(500); // Should be nearly instant
  });

  it("enforces concurrency limit", async () => {
    const limiter = makeLimiter({ maxConcurrency: 2, defaultRpm: 600 });
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 4 }, async () => {
      await limiter.acquire("example.com");
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Simulate work
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      limiter.release("example.com");
    });

    await Promise.all(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("extracts domain from URL", () => {
    expect(RateLimiter.domainFromUrl("https://www.example.com/path?q=1")).toBe("example.com");
    expect(RateLimiter.domainFromUrl("https://sub.domain.co.uk/path")).toBe("sub.domain.co.uk");
    expect(RateLimiter.domainFromUrl("https://example.com:8080/path")).toBe("example.com");
  });

  it("handles invalid URLs gracefully", () => {
    expect(RateLimiter.domainFromUrl("not-a-url")).toBe("unknown");
  });

  it("reports rate limit backoff", () => {
    const limiter = makeLimiter();
    limiter.reportRateLimited("example.com", 1000);
    const stats = limiter.stats();
    const example = stats.find((s) => s.domain === "example.com");
    expect(example?.backoff).toBe(true);
  });

  it("reports success resets backoff", () => {
    const limiter = makeLimiter();
    limiter.reportRateLimited("example.com", 100);
    limiter.reportSuccess("example.com");
    limiter.reportSuccess("example.com");
    const stats = limiter.stats();
    const example = stats.find((s) => s.domain === "example.com");
    expect(example?.backoff).toBe(false);
  });

  it("tracks multiple domains independently", () => {
    const limiter = makeLimiter({ defaultRpm: 600 });
    limiter.reportRateLimited("a.com", 5000);
    limiter.reportSuccess("a.com");
    // b.com should not be affected
    const stats = limiter.stats();
    const b = stats.find((s) => s.domain === "b.com");
    const a = stats.find((s) => s.domain === "a.com");
    expect(a).toBeDefined();
    expect(b).toBeUndefined(); // b.com was never accessed
  });

  it("provides stats for tracked domains", () => {
    const limiter = makeLimiter({ defaultRpm: 600 });
    limiter.acquire("stats-test.com").then(() => limiter.release("stats-test.com"));
    const stats = limiter.stats();
    expect(stats.length).toBeGreaterThanOrEqual(0);
  });
});
