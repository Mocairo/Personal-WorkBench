import { pages } from "../data/pageRegistry.js";

function findMetadataValue(metadata, label, fallback = "0") {
  return metadata.find((item) => item.label === label)?.value ?? fallback;
}

function findMetricValue(metrics, label, fallback = "0%") {
  return metrics.find((item) => item.label === label)?.value ?? fallback;
}

function getIntelStatus(intelCenter) {
  const databaseState = intelCenter.intelSources.find((item) => (
    typeof item === "string" ? item.startsWith("database:") : item.label === "database"
  ));

  if (typeof databaseState === "string") {
    return databaseState.includes("ready") ? "ready" : "missing";
  }

  return databaseState?.status === "ready" || databaseState?.value === "ready" ? "ready" : "missing";
}

function getReportsCount(intelCenter) {
  if (intelCenter.workspaceStatus?.reportCount !== undefined) {
    return String(intelCenter.workspaceStatus.reportCount);
  }

  const reports = intelCenter.intelSources.find((item) => (
    typeof item === "string" ? item.startsWith("reports:") : item.label === "reports"
  ));

  if (typeof reports === "string") {
    return reports.replace("reports:", "").trim();
  }

  return reports?.value ?? String(reports?.checks ?? 0);
}

export function buildHomeDashboardData(moduleData) {
  const { codeRepository, intelCenter, knowledgeBase, localMusic, widgets } = moduleData;
  const memoryValue = findMetricValue(widgets.systemMetrics, "Memory");
  const tracksValue = findMetadataValue(localMusic.audioMetadata, "Tracks");
  const latestIntelTitle = intelCenter.intelCards[0]?.title ?? "No intel reports yet";
  const pendingKnowledge = knowledgeBase.indexStats.pending ?? 0;
  const repositoryChanges = codeRepository.gitState.changed ?? 0;
  const reportsCount = getReportsCount(intelCenter);

  return {
    serviceState: [
      { name: "local-intel", value: getIntelStatus(intelCenter), tone: "good" },
      { name: "knowledge", value: knowledgeBase.indexStats.progress, tone: pendingKnowledge > 0 ? "warm" : "good" },
      { name: "code", value: codeRepository.gitState.statusLabel, tone: repositoryChanges > 0 ? "warm" : "good" },
      { name: "system", value: `${memoryValue} memory`, tone: "cool" },
    ],
    homeTasks: [
      {
        title: `Review ${pendingKnowledge} pending knowledge docs`,
        module: "Knowledge Base",
        time: "now",
      },
      {
        title: `Check ${repositoryChanges} repository changes`,
        module: "Code Repository",
        time: "now",
      },
      {
        title: `Read latest intel: ${latestIntelTitle}`,
        module: "情报中心",
        time: "now",
      },
      {
        title: `Scan local music library: ${tracksValue} tracks`,
        module: "Local Music",
        time: "now",
      },
    ],
    recentActivities: [
      `Knowledge Base indexed ${knowledgeBase.indexStats.docs} docs / ${knowledgeBase.indexStats.chunks} chunks`,
      `Code Repository on ${codeRepository.gitState.branch} with ${repositoryChanges} changes`,
      `Local Intel collected ${reportsCount} reports`,
      `Widgets report CPU ${findMetricValue(widgets.systemMetrics, "CPU")}, Memory ${memoryValue}, Disk ${findMetricValue(widgets.systemMetrics, "Disk")}`,
    ],
    quickEntries: pages.slice(1),
  };
}

export async function getHomeDashboardData(provider) {
  const [codeRepository, intelCenter, knowledgeBase, localMusic, widgets] = await Promise.all([
    provider.getCodeRepository(),
    provider.getIntelCenter(),
    provider.getKnowledgeBase(),
    provider.getLocalMusic(),
    provider.getWidgets(),
  ]);

  return buildHomeDashboardData({
    codeRepository,
    intelCenter,
    knowledgeBase,
    localMusic,
    widgets,
  });
}
