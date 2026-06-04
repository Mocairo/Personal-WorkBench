import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLocalIntelCenterData,
  getLocalIntelDashboardSummary,
  getLocalIntelServiceStatus,
  getLocalIntelSourceHealth,
  listLocalIntelLogs,
  listLocalIntelReports,
} from "./localIntelAdapter";

async function createLocalIntelFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-intel-"));
  await fs.mkdir(path.join(rootDir, "data"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "reports"), { recursive: true });

  await fs.writeFile(path.join(rootDir, "data", "intel.sqlite"), "");
  await fs.writeFile(path.join(rootDir, "data", "web.pid"), "123");
  await fs.writeFile(path.join(rootDir, "data", "scheduler.pid"), "456");
  await fs.writeFile(
    path.join(rootDir, "status.json"),
    JSON.stringify({ lastRunAt: "2026-05-31T09:30:00.000Z", scheduler: "idle" }),
  );
  await fs.writeFile(
    path.join(rootDir, "logs", "2026-05-31.jsonl"),
    [
      '{"time":"2026-05-31T09:00:00.000Z","level":"info","message":"fetch completed"}',
      '{"time":"2026-05-31T09:05:00.000Z","level":"error","message":"api_key=abcd1234 failed"}',
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(rootDir, "reports", "2026-05-30.md"),
    "# 2026-05-30\n\nOlder report\n",
  );
  await fs.writeFile(
    path.join(rootDir, "reports", "2026-05-31.md"),
    "# 2026-05-31\n\nSummary uses token=sk-secret and should be redacted.\n\n## Sources\nlocal\n",
  );
  await fs.writeFile(
    path.join(rootDir, "reports", "release.json"),
    JSON.stringify({
      priority: "medium",
      summary: "JSON report summary",
      tags: ["release", "github"],
      title: "Release Watch",
    }),
  );

  return rootDir;
}

describe("local intel adapter", () => {
  it("builds Intel Center data from the local-intel workspace", async () => {
    const rootDir = await createLocalIntelFixture();

    const data = await getLocalIntelCenterData({ rootDir });

    expect(data.workspaceStatus).toMatchObject({
      databaseReady: true,
      logCount: 2,
      reportCount: 3,
      status: "ready",
    });
    expect(data.intelSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "reports", status: "ready", value: "3" }),
      expect.objectContaining({ label: "logs", status: "ready", value: "2" }),
      expect.objectContaining({ label: "database", status: "ready", value: "ready" }),
    ]));
    expect(data.collectionSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Reports", state: "ready", count: 3 }),
      expect.objectContaining({ label: "Logs", state: "ready", count: 2 }),
      expect.objectContaining({ label: "Runtime", state: "ready" }),
    ]));
    const markdownReport = data.intelCards.find((card) => card.relativePath === "reports/2026-05-31.md");
    expect(markdownReport).toMatchObject({
      title: "2026-05-31",
      relativePath: "reports/2026-05-31.md",
      source: "local",
      priority: expect.any(String),
    });
    expect(markdownReport.summary).toContain("token=[redacted]");
    expect(JSON.stringify(data)).not.toContain(rootDir);
    expect(JSON.stringify(data)).not.toContain("sk-secret");
  });

  it("probes local-intel read-only status without starting services", async () => {
    const rootDir = await createLocalIntelFixture();

    await expect(getLocalIntelServiceStatus({ rootDir })).resolves.toMatchObject({
      databaseReady: true,
      logsReady: true,
      reportsReady: true,
      runtimeTracked: true,
      scripts: {
        start: false,
        status: false,
        stop: false,
      },
      status: "running",
      workspaceConfigured: true,
    });
    await expect(getLocalIntelDashboardSummary({ rootDir })).resolves.toMatchObject({
      databaseReady: true,
      logCount: 2,
      latestReportAt: expect.any(String),
      reportCount: 3,
      runtimeTracked: true,
      state: "ready",
    });
    await expect(getLocalIntelSourceHealth({ rootDir })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "local-intel workspace", state: "enabled", status: "ready" }),
      expect.objectContaining({ label: "reports", state: "enabled", status: "ready", value: "3" }),
      expect.objectContaining({ label: "logs", state: "enabled", status: "ready", value: "2" }),
      expect.objectContaining({ label: "database", state: "enabled", status: "ready", value: "ready" }),
    ]));
    await expect(listLocalIntelReports({ rootDir })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        relativePath: "reports/2026-05-31.md",
        reportId: "2026-05-31",
        summary: expect.stringContaining("token=[redacted]"),
      }),
      expect.objectContaining({
        priority: "medium",
        relativePath: "reports/release.json",
        reportId: "release",
        tags: ["release", "github"],
        title: "Release Watch",
      }),
    ]));
    await expect(listLocalIntelLogs({ rootDir })).resolves.toEqual([
      expect.objectContaining({ level: "info", message: "fetch completed" }),
      expect.objectContaining({ level: "error", message: "api_key=[redacted] failed", severity: "high" }),
    ]);
  });

  it("returns safe placeholder data when the workspace is missing", async () => {
    const data = await getLocalIntelCenterData({
      rootDir: path.join(os.tmpdir(), "missing-local-intel-workspace"),
    });

    expect(data.intelSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "local-intel workspace", status: "missing" }),
      expect.objectContaining({ label: "reports", status: "missing" }),
      expect.objectContaining({ label: "logs", status: "missing" }),
      expect.objectContaining({ label: "database", status: "missing" }),
    ]));
    expect(data.intelCards[0]).toMatchObject({
      title: "local-intel workspace not found",
      source: "missing workspace",
      priority: "high",
    });
    await expect(
      getLocalIntelServiceStatus({ rootDir: path.join(os.tmpdir(), "missing-local-intel-workspace") }),
    ).resolves.toMatchObject({
      status: "not_configured",
      workspaceConfigured: false,
    });
  });

  it("ignores hidden, temporary, unsupported and oversized report files", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-intel-safe-"));
    await fs.mkdir(path.join(rootDir, "reports", ".hidden"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "reports", "visible.md"), "# Visible\n\nSafe report\n");
    await fs.writeFile(path.join(rootDir, "reports", ".secret.md"), "# Secret\n");
    await fs.writeFile(path.join(rootDir, "reports", "draft.tmp"), "temporary\n");
    await fs.writeFile(path.join(rootDir, "reports", "large.md"), "x".repeat(128));

    const reports = await listLocalIntelReports({ maxReportSizeBytes: 32, rootDir });

    expect(reports).toEqual([
      expect.objectContaining({ relativePath: "reports/visible.md", title: "Visible" }),
    ]);
    expect(JSON.stringify(reports)).not.toContain("Secret");
  });

  it("returns stale states when reports or logs directories are missing", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-intel-incomplete-"));
    await fs.mkdir(path.join(rootDir, "data"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "data", "intel.sqlite"), "");

    const data = await getLocalIntelCenterData({ rootDir });

    expect(data.workspaceStatus).toMatchObject({
      databaseReady: true,
      logsReady: false,
      reportsReady: false,
      status: "stale",
    });
    expect(data.collectionSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Reports", state: "missing" }),
      expect.objectContaining({ label: "Logs", state: "missing" }),
    ]));
  });
});
