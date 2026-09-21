import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = join(process.cwd(), "web/public/assets/embodied-trends.js");
const loadModule = () => import(pathToFileURL(modulePath).href);

describe("daily embodied trend ordering", () => {
  it("uses the Shanghai calendar boundary regardless of input timezone", async () => {
    const { shanghaiDateKey } = await loadModule();
    expect(shanghaiDateKey(new Date("2026-09-19T15:59:59Z"))).toBe("2026-09-19");
    expect(shanghaiDateKey(new Date("2026-09-19T16:00:00Z"))).toBe("2026-09-20");
    expect(shanghaiDateKey(new Date("2026-09-19T09:00:00-07:00"))).toBe("2026-09-20");
    expect(shanghaiDateKey(new Date("2026-09-20T05:00:00+13:00"))).toBe("2026-09-20");
  });

  it("keeps one daily permutation and changes it on the specified adjacent days", async () => {
    const { dailyTrendOrder } = await loadModule();
    const order = dailyTrendOrder(8, "2026-09-20");
    expect(order).toEqual(dailyTrendOrder(8, "2026-09-20"));
    expect(order).not.toEqual(dailyTrendOrder(8, "2026-09-21"));
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(dailyTrendOrder(0, "2026-09-20")).toEqual([]);
    expect(dailyTrendOrder(-1, "2026-09-20")).toEqual([]);
    expect(dailyTrendOrder(1, "2026-09-20")).toEqual([0]);
  });

  it("reorders the same readable nodes and labels the active day without cumulative shuffling", async () => {
    const { dailyTrendOrder, setupDailyEmbodiedTrends } = await loadModule();
    const original = Array.from({ length: 8 }, (_, index) => ({
      dataset: { trendIndex: String(index) },
      hidden: false,
      textContent: `Evidence ${index}`,
    }));
    let nodes = [...original];
    const list = {
      querySelectorAll: () => nodes,
      append: (node: (typeof original)[number]) => {
        nodes = [...nodes.filter((current) => current !== node), node];
      },
    };
    const status = { textContent: "Catalog order", dataset: { dailyLabel: "Daily order" } };
    const root = {
      querySelector: (selector: string) =>
        selector === "[data-trend-list]"
          ? list
          : selector === "[data-trend-status]"
            ? status
            : null,
    };
    setupDailyEmbodiedTrends(root, new Date("2026-09-19T16:00:00Z"));
    const firstOrder = [...nodes];
    expect(nodes.map((node) => Number(node.dataset.trendIndex))).toEqual(
      dailyTrendOrder(8, "2026-09-20"),
    );
    expect(status.textContent).toBe("Daily order · 2026-09-20 · Asia/Shanghai");
    setupDailyEmbodiedTrends(root, new Date("2026-09-20T15:59:59Z"));
    expect(nodes).toEqual(firstOrder);
    expect(nodes.every((node) => original.includes(node) && !node.hidden)).toBe(true);
    expect(nodes.map((node) => node.textContent).sort()).toEqual(
      original.map((node) => node.textContent).sort(),
    );
    expect(() => setupDailyEmbodiedTrends(null)).not.toThrow();
  });

  it("does not use random sampling in the daily module", async () => {
    expect(await readFile(modulePath, "utf8")).not.toMatch(/Math\.random\s*\(/);
  });
});
