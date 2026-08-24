import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readLogs } from "./executionLog";

const storageFile = path.join(process.cwd(), ".data", "execution-logs.json");

describe("server hardening", () => {
  afterEach(async () => {
    delete process.env.EXECUTION_LOG_STRICT_PARSE;
    vi.restoreAllMocks();
    await fs.mkdir(path.dirname(storageFile), { recursive: true });
    await fs.writeFile(storageFile, "[]", "utf8");
  });
  it("execution log parser registra erro estruturado antes do fallback", async () => {
    await fs.mkdir(path.dirname(storageFile), { recursive: true });
    await fs.writeFile(storageFile, "{invalid-json", "utf8");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(readLogs()).resolves.toEqual([]);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"execution_log_parse_failed"')
    );
  });

  it("execution log parser lança em modo estrito", async () => {
    process.env.EXECUTION_LOG_STRICT_PARSE = "true";
    await fs.mkdir(path.dirname(storageFile), { recursive: true });
    await fs.writeFile(storageFile, "{invalid-json", "utf8");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(readLogs()).rejects.toThrow();
  });
});
