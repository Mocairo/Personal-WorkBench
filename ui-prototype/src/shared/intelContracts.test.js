import { describe, expect, it } from "vitest";
import {
  buildIntelCollectionStatus,
  buildIntelDashboardSummary,
  buildIntelLogEntry,
  buildIntelReport,
  buildIntelSourceHealth,
  buildIntelWorkspaceStatus,
} from "./intelContracts";

describe("intel contracts", () => {
  it("normalizes reports, logs and source health into renderer-safe shapes", () => {
    expect(
      buildIntelReport({
        excerpt: "token=sk-secret should not leak",
        priority: "high",
        relativePath: "reports/daily.md",
        reportId: "daily",
        tags: ["agent", "risk"],
        title: "Daily Intel",
        updatedAt: "2026-06-02T08:00:00.000Z",
      }),
    ).toMatchObject({
      id: "daily",
      priority: "high",
      relativePath: "reports/daily.md",
      reportId: "daily",
      source: "local",
      status: "ready",
      summary: "token=[redacted] should not leak",
      tags: ["agent", "risk"],
      title: "Daily Intel",
      updatedAt: "2026-06-02T08:00:00.000Z",
    });

    expect(buildIntelLogEntry({ level: "error", message: "api_key=abcd1234 failed" })).toMatchObject({
      level: "error",
      message: "api_key=[redacted] failed",
      severity: "high",
      source: "local",
    });

    expect(buildIntelSourceHealth({ checks: 3, label: "reports", status: "ready" })).toMatchObject({
      checks: 3,
      label: "reports",
      state: "enabled",
      status: "ready",
    });
  });

  it("builds workspace, collection and dashboard summaries with stable defaults", () => {
    expect(buildIntelWorkspaceStatus({ reportCount: 2, status: "ready" })).toMatchObject({
      configured: true,
      logCount: 0,
      reportCount: 2,
      source: "local",
      status: "ready",
    });

    expect(buildIntelCollectionStatus({ count: 2, label: "Reports", status: "ready" })).toMatchObject({
      count: 2,
      label: "Reports",
      progress: "100%",
      state: "ready",
    });

    expect(buildIntelDashboardSummary({ latestReportAt: "2026-06-02T08:00:00.000Z", reportCount: 2 })).toMatchObject({
      latestReportAt: "2026-06-02T08:00:00.000Z",
      reportCount: 2,
      source: "local",
      state: "ready",
    });
  });
});
