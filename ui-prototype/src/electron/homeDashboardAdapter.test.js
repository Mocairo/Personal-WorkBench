import { describe, expect, it } from "vitest";
import { buildHomeDashboardData, getHomeDashboardData } from "./homeDashboardAdapter";

function createModuleData() {
  return {
    codeRepository: {
      gitState: { branch: "main", changed: 2, statusLabel: "2 changes" },
      repoMetrics: { modules: 3, symbols: 12, changed: 2 },
    },
    intelCenter: {
      collectionSteps: ["Database ready", "Reports 4", "Logs 3", "Runtime tracked"],
      intelCards: [{ title: "Daily Report", priority: "high", source: "local report" }],
      intelSources: ["local-intel service", "reports: 4", "logs: 3", "database: ready"],
    },
    knowledgeBase: {
      indexStats: { chunks: 10, docs: 4, pending: 1, progress: "75%" },
      knowledgeDocuments: [{ title: "README.md", tag: "markdown", state: "indexed" }],
    },
    localMusic: {
      audioMetadata: [{ label: "Tracks", value: "8" }],
      tracks: [{ title: "Night Workspace", artist: "Local", length: "--:--" }],
    },
    widgets: {
      systemMetrics: [
        { label: "CPU", value: "20%" },
        { label: "Memory", value: "40%" },
        { label: "Disk", value: "60%" },
      ],
    },
  };
}

describe("home dashboard adapter", () => {
  it("builds Home Dashboard data from connected local modules", () => {
    const data = buildHomeDashboardData(createModuleData());

    expect(data.serviceState).toEqual([
      { name: "local-intel", value: "ready", tone: "good" },
      { name: "knowledge", value: "75%", tone: "warm" },
      { name: "code", value: "2 changes", tone: "warm" },
      { name: "system", value: "40% memory", tone: "cool" },
    ]);
    expect(data.homeTasks).toEqual([
      { title: "Review 1 pending knowledge docs", module: "Knowledge Base", time: "now" },
      { title: "Check 2 repository changes", module: "Code Repository", time: "now" },
      { title: "Read latest intel: Daily Report", module: "情报中心", time: "now" },
      { title: "Scan local music library: 8 tracks", module: "Local Music", time: "now" },
    ]);
    expect(data.recentActivities).toEqual([
      "Knowledge Base indexed 4 docs / 10 chunks",
      "Code Repository on main with 2 changes",
      "Local Intel collected 4 reports",
      "Widgets report CPU 20%, Memory 40%, Disk 60%",
    ]);
    expect(data.quickEntries.map((page) => page.id)).toEqual([
      "chat",
      "knowledge",
      "agents",
      "code",
      "music",
      "intel",
      "widgets",
    ]);
  });

  it("loads module data through the provided provider", async () => {
    const moduleData = createModuleData();
    const provider = {
      getCodeRepository: async () => moduleData.codeRepository,
      getIntelCenter: async () => moduleData.intelCenter,
      getKnowledgeBase: async () => moduleData.knowledgeBase,
      getLocalMusic: async () => moduleData.localMusic,
      getWidgets: async () => moduleData.widgets,
    };

    await expect(getHomeDashboardData(provider)).resolves.toMatchObject({
      homeTasks: expect.arrayContaining([
        expect.objectContaining({ module: "Knowledge Base" }),
        expect.objectContaining({ module: "Code Repository" }),
      ]),
      serviceState: expect.arrayContaining([
        expect.objectContaining({ name: "local-intel", value: "ready" }),
      ]),
    });
  });
});
