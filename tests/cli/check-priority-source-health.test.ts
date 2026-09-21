import { afterEach, expect, it, vi } from "vitest";

const readReport = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: readReport,
}));
const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each([
  "PRIVATE_INVALID_JSON",
  '{"completedAt":"PRIVATE_SENTINEL"}',
])("fails closed without echoing malformed report content: %s", async (content) => {
  readReport.mockResolvedValue(content);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("../../src/cli/check-priority-source-health.js");
  expect(process.exitCode).toBe(1);
  expect(output).toHaveBeenCalledWith('{"status":"invalid","completedAt":null}');
});
