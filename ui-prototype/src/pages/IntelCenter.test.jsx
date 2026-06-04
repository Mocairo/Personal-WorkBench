import { describe, expect, it } from "vitest";
import { getIntelDisplayData } from "./IntelCenter";

describe("IntelCenter display data", () => {
  it("prefers real local-intel reports, source health and collection states over fallback decoration", () => {
    const data = getIntelDisplayData({
      collectionSteps: [
        { count: 2, label: "Reports", progress: "100%", state: "ready" },
        { count: 1, label: "Logs", progress: "100%", state: "ready" },
      ],
      intelCards: [
        {
          priority: "high",
          relativePath: "reports/daily.md",
          source: "local",
          state: "summary ready",
          summary: "Daily report excerpt",
          tags: ["github", "release"],
          title: "Daily Report",
          updatedAt: "2026-06-02T08:00:00.000Z",
        },
      ],
      intelSources: [
        { checks: 2, label: "reports", status: "ready", state: "enabled", value: "2" },
        { checks: 1, label: "logs", status: "ready", state: "enabled", value: "1" },
      ],
      providerStatus: { message: "local", status: "ready" },
      sourceHealth: { path: "D:\\redacted\\local-intel", status: "ready" },
    });

    expect(data.collectionSteps).toEqual([
      expect.objectContaining({ count: 2, label: "Reports", progress: "100%", state: "ready" }),
      expect.objectContaining({ count: 1, label: "Logs", progress: "100%", state: "ready" }),
    ]);
    expect(data.intelCards).toEqual([
      expect.objectContaining({
        excerpt: "Daily report excerpt",
        tags: "github, release",
        time: "2026-06-02T08:00:00.000Z",
        title: "Daily Report",
      }),
    ]);
    expect(data.intelSources).toEqual([
      expect.objectContaining({ checks: "2", label: "reports", state: "enabled" }),
      expect.objectContaining({ checks: "1", label: "logs", state: "enabled" }),
    ]);
  });
});
