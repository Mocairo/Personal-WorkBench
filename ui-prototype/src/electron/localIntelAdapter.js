import fs from "node:fs/promises";
import path from "node:path";
import {
  buildIntelCollectionStatus,
  buildIntelDashboardSummary,
  buildIntelLogEntry,
  buildIntelReport,
  buildIntelSourceHealth,
  buildIntelWorkspaceStatus,
  redactIntelText,
} from "../shared/intelContracts.js";

export const DEFAULT_LOCAL_INTEL_ROOT =
  "D:\\python_code\\local-intel\\.worktrees\\reliability-foundation";

const DEFAULT_MAX_REPORTS = 12;
const DEFAULT_MAX_REPORT_SIZE_BYTES = 256 * 1024;
const DEFAULT_MAX_LOG_FILES = 3;
const DEFAULT_MAX_LOG_LINES = 30;
const SUPPORTED_REPORT_EXTENSIONS = new Set([".md", ".txt", ".json", ".html"]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function safeStat(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function resolveLocalIntelRoot(options = {}) {
  return options.rootDir ?? process.env.LOCAL_INTEL_ROOT ?? DEFAULT_LOCAL_INTEL_ROOT;
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isHiddenOrTemporary(name) {
  return name.startsWith(".") || name.endsWith(".tmp") || name.endsWith("~");
}

function getReportPriority(index, report = {}) {
  return report.priority ?? (index === 0 ? "high" : index === 1 ? "medium" : "low");
}

function firstUsefulLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) ?? "";
}

function parseMarkdownReport(text, fallbackTitle) {
  const titleLine = text.split(/\r?\n/).find((line) => /^#\s+/.test(line.trim()));
  const title = titleLine?.replace(/^#\s+/, "").trim() || fallbackTitle;

  return {
    summary: firstUsefulLine(text),
    tags: ["markdown"],
    title,
  };
}

function parseTextReport(text, fallbackTitle) {
  const title = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? fallbackTitle;

  return {
    summary: firstUsefulLine(text),
    tags: ["text"],
    title,
  };
}

function stripHtml(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlReport(text, fallbackTitle) {
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || fallbackTitle;
  const summary = stripHtml(text).slice(0, 220);

  return {
    summary,
    tags: ["html"],
    title,
  };
}

function parseJsonReport(text, fallbackTitle) {
  try {
    const parsed = JSON.parse(text);
    return {
      priority: parsed.priority,
      summary: parsed.summary ?? parsed.excerpt ?? parsed.message ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : ["json"],
      title: parsed.title ?? parsed.name ?? fallbackTitle,
    };
  } catch {
    return {
      summary: "",
      tags: ["json"],
      title: fallbackTitle,
    };
  }
}

function parseReportText(text, extension, fallbackTitle) {
  if (extension === ".json") {
    return parseJsonReport(text, fallbackTitle);
  }
  if (extension === ".html") {
    return parseHtmlReport(text, fallbackTitle);
  }
  if (extension === ".md") {
    return parseMarkdownReport(text, fallbackTitle);
  }
  return parseTextReport(text, fallbackTitle);
}

async function listReportEntries(reportsDir, rootDir, options = {}) {
  const maxReports = options.maxReports ?? DEFAULT_MAX_REPORTS;
  const maxReportSizeBytes = options.maxReportSizeBytes ?? DEFAULT_MAX_REPORT_SIZE_BYTES;
  let entries = [];

  try {
    entries = await fs.readdir(reportsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || isHiddenOrTemporary(entry.name)) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_REPORT_EXTENSIONS.has(extension)) {
      continue;
    }

    const filePath = path.join(reportsDir, entry.name);
    const stat = await safeStat(filePath);
    if (!stat || stat.size > maxReportSizeBytes) {
      continue;
    }

    files.push({ entry, extension, filePath, stat });
  }

  files.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.entry.name.localeCompare(left.entry.name));

  const reports = [];
  for (const [index, file] of files.slice(0, maxReports).entries()) {
    const text = await fs.readFile(file.filePath, "utf8").catch(() => "");
    const fallbackTitle = path.basename(file.entry.name, file.extension);
    const parsed = parseReportText(text, file.extension, fallbackTitle);
    const relativePath = normalizeRelativePath(path.relative(rootDir, file.filePath));

    reports.push(buildIntelReport({
      ...parsed,
      priority: getReportPriority(index, parsed),
      relativePath,
      reportId: fallbackTitle,
      updatedAt: file.stat.mtime.toISOString(),
    }));
  }

  return reports;
}

function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      level: parsed.level ?? parsed.severity ?? "info",
      message: parsed.message ?? parsed.event ?? trimmed,
      time: parsed.time ?? parsed.timestamp ?? parsed.updatedAt,
    };
  } catch {
    const match = trimmed.match(/^\[?([^\]\s]+)\]?\s+(error|warn|warning|info|debug)\s+(.+)$/i);
    if (match) {
      return {
        level: match[2],
        message: match[3],
        time: match[1],
      };
    }
    return {
      level: /error/i.test(trimmed) ? "error" : /warn/i.test(trimmed) ? "warn" : "info",
      message: trimmed,
    };
  }
}

async function listLogEntries(logsDir, rootDir, options = {}) {
  const maxLogFiles = options.maxLogFiles ?? DEFAULT_MAX_LOG_FILES;
  const maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
  let entries = [];

  try {
    entries = await fs.readdir(logsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || isHiddenOrTemporary(entry.name)) {
      continue;
    }
    if (!/\.(jsonl|log|txt)$/i.test(entry.name)) {
      continue;
    }

    const filePath = path.join(logsDir, entry.name);
    const stat = await safeStat(filePath);
    if (stat) {
      files.push({ entry, filePath, stat });
    }
  }

  files.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.entry.name.localeCompare(left.entry.name));

  const logs = [];
  for (const file of files.slice(0, maxLogFiles)) {
    const text = await fs.readFile(file.filePath, "utf8").catch(() => "");
    const relativePath = normalizeRelativePath(path.relative(rootDir, file.filePath));

    for (const line of text.split(/\r?\n/)) {
      if (logs.length >= maxLogLines) {
        return logs;
      }

      const parsed = parseLogLine(line);
      if (!parsed) {
        continue;
      }

      logs.push(buildIntelLogEntry({
        ...parsed,
        id: `log-${logs.length + 1}`,
        relativePath,
        updatedAt: parsed.time ?? file.stat.mtime.toISOString(),
      }));
    }
  }

  return logs;
}

async function readStatusSummary(rootDir) {
  const candidates = [
    path.join(rootDir, "status.json"),
    path.join(rootDir, "state.json"),
    path.join(rootDir, "data", "status.json"),
    path.join(rootDir, "data", "state.json"),
  ];

  for (const candidate of candidates) {
    const stat = await safeStat(candidate);
    if (!stat?.isFile()) {
      continue;
    }

    const text = await fs.readFile(candidate, "utf8").catch(() => "");
    try {
      const parsed = JSON.parse(text);
      return {
        lastRunAt: parsed.lastRunAt ?? parsed.updatedAt ?? parsed.time ?? stat.mtime.toISOString(),
        message: redactIntelText(parsed.message ?? parsed.status ?? ""),
        relativePath: normalizeRelativePath(path.relative(rootDir, candidate)),
        status: parsed.status ?? parsed.scheduler ?? "ready",
        updatedAt: stat.mtime.toISOString(),
      };
    } catch {
      return {
        lastRunAt: stat.mtime.toISOString(),
        message: redactIntelText(firstUsefulLine(text)),
        relativePath: normalizeRelativePath(path.relative(rootDir, candidate)),
        status: "ready",
        updatedAt: stat.mtime.toISOString(),
      };
    }
  }

  return null;
}

async function readLocalIntelProbe(options = {}) {
  const rootDir = resolveLocalIntelRoot(options);
  const dataDir = path.join(rootDir, "data");
  const logsDir = path.join(rootDir, "logs");
  const reportsDir = path.join(rootDir, "reports");
  const sourcesDir = path.join(rootDir, "sources");
  const configDir = path.join(rootDir, "config");

  const [
    workspaceExists,
    reportsDirReady,
    logsDirReady,
    databaseReady,
    webPidTracked,
    schedulerPidTracked,
    sourcesReady,
    configReady,
    statusSummary,
    startScriptReady,
    statusScriptReady,
    stopScriptReady,
  ] = await Promise.all([
    pathExists(rootDir),
    pathExists(reportsDir),
    pathExists(logsDir),
    pathExists(path.join(dataDir, "intel.sqlite")),
    pathExists(path.join(dataDir, "web.pid")),
    pathExists(path.join(dataDir, "scheduler.pid")),
    pathExists(sourcesDir),
    pathExists(configDir),
    readStatusSummary(rootDir),
    pathExists(path.join(rootDir, "scripts", "start.ps1")),
    pathExists(path.join(rootDir, "scripts", "status.ps1")),
    pathExists(path.join(rootDir, "scripts", "stop.ps1")),
  ]);

  const reports = workspaceExists ? await listReportEntries(reportsDir, rootDir, options) : [];
  const logs = workspaceExists ? await listLogEntries(logsDir, rootDir, options) : [];
  const latestReportAt = reports[0]?.updatedAt ?? null;
  const reportsReady = reportsDirReady && reports.length > 0;
  const logsReady = logsDirReady && logs.length > 0;
  const runtimeTracked = webPidTracked || schedulerPidTracked;
  const status = !workspaceExists
    ? "missing"
    : reportsDirReady && logsDirReady
      ? "ready"
      : "stale";

  return {
    rootDir,
    dataDir,
    databaseReady,
    logs,
    logsDir,
    logsDirReady,
    logsReady,
    reports,
    reportsDir,
    reportsDirReady,
    reportsReady,
    runtimeTracked,
    schedulerPidTracked,
    scripts: {
      start: startScriptReady,
      status: statusScriptReady,
      stop: stopScriptReady,
    },
    sourcesReady,
    configReady,
    status,
    statusSummary,
    latestReportAt,
    webPidTracked,
    workspaceExists,
  };
}

function buildReportCards(reports, workspaceExists) {
  if (reports.length === 0) {
    return [
      buildIntelReport({
        priority: "high",
        source: workspaceExists ? "local" : "missing workspace",
        status: workspaceExists ? "stale" : "missing",
        summary: workspaceExists ? "No reports found in the configured local-intel workspace." : "Configure a local-intel workspace to read reports.",
        title: workspaceExists ? "No local-intel reports yet" : "local-intel workspace not found",
      }),
    ];
  }

  return reports.slice(0, 3);
}

function buildIntelSources(probe) {
  return [
    buildIntelSourceHealth({
      label: "local-intel workspace",
      status: probe.workspaceExists ? "ready" : "missing",
      value: probe.workspaceExists ? "ready" : "missing",
    }),
    buildIntelSourceHealth({
      checks: probe.reports.length,
      label: "reports",
      status: probe.reportsDirReady ? "ready" : "missing",
      value: String(probe.reports.length),
    }),
    buildIntelSourceHealth({
      checks: probe.logs.length,
      label: "logs",
      status: probe.logsDirReady ? "ready" : "missing",
      value: String(probe.logs.length),
    }),
    buildIntelSourceHealth({
      label: "database",
      status: probe.databaseReady ? "ready" : "missing",
      value: probe.databaseReady ? "ready" : "missing",
    }),
    buildIntelSourceHealth({
      label: "status file",
      status: probe.statusSummary ? "ready" : "stale",
      value: probe.statusSummary?.relativePath ?? "missing",
    }),
    buildIntelSourceHealth({
      label: "sources/config",
      status: probe.sourcesReady || probe.configReady ? "ready" : "stale",
      value: probe.sourcesReady ? "sources" : probe.configReady ? "config" : "missing",
    }),
  ];
}

function buildCollectionSteps(probe) {
  return [
    buildIntelCollectionStatus({
      count: probe.reports.length,
      label: "Reports",
      status: probe.reportsDirReady ? "ready" : "missing",
    }),
    buildIntelCollectionStatus({
      count: probe.logs.length,
      label: "Logs",
      status: probe.logsDirReady ? "ready" : "missing",
    }),
    buildIntelCollectionStatus({
      count: probe.databaseReady ? 1 : 0,
      label: "Database",
      status: probe.databaseReady ? "ready" : "missing",
    }),
    buildIntelCollectionStatus({
      count: probe.runtimeTracked ? 1 : 0,
      label: "Runtime",
      status: probe.runtimeTracked ? "ready" : "stale",
    }),
  ];
}

function buildWorkspaceStatus(probe) {
  return buildIntelWorkspaceStatus({
    configured: probe.workspaceExists,
    databaseReady: probe.databaseReady,
    dataStoreReady: probe.databaseReady,
    logCount: probe.logs.length,
    logsReady: probe.logsReady,
    reportCount: probe.reports.length,
    reportsReady: probe.reportsReady,
    rootReady: probe.workspaceExists,
    runtimeTracked: probe.runtimeTracked,
    status: probe.status,
    updatedAt: probe.latestReportAt ?? probe.statusSummary?.updatedAt ?? null,
  });
}

export async function getLocalIntelCenterData(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return {
    collectionSteps: buildCollectionSteps(probe),
    intelCards: buildReportCards(probe.reports, probe.workspaceExists),
    intelLogs: probe.logs,
    intelSources: buildIntelSources(probe),
    workspaceStatus: buildWorkspaceStatus(probe),
  };
}

export async function getLocalIntelServiceStatus(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return {
    serviceId: "local-intel",
    name: "local-intel",
    status: !probe.workspaceExists
      ? "not_configured"
      : probe.runtimeTracked
        ? "running"
        : probe.databaseReady || probe.reportsDirReady || probe.logsDirReady
          ? "stopped"
          : "degraded",
    workspaceConfigured: probe.workspaceExists,
    databaseReady: probe.databaseReady,
    logsReady: probe.logsReady,
    reportsReady: probe.reportsReady,
    runtimeTracked: probe.runtimeTracked,
    webPidTracked: probe.webPidTracked,
    schedulerPidTracked: probe.schedulerPidTracked,
    scripts: probe.scripts,
    statusFileReady: Boolean(probe.statusSummary),
  };
}

export async function getLocalIntelDashboardSummary(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return buildIntelDashboardSummary({
    databaseReady: probe.databaseReady,
    latestReportAt: probe.latestReportAt,
    logCount: probe.logs.length,
    reportCount: probe.reports.length,
    runtimeTracked: probe.runtimeTracked,
    state: probe.status,
    status: probe.status,
    updatedAt: probe.latestReportAt ?? probe.statusSummary?.updatedAt ?? null,
  });
}

export async function getLocalIntelSourceHealth(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return buildIntelSources(probe);
}

export async function listLocalIntelReports(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return probe.reports;
}

export async function listLocalIntelLogs(options = {}) {
  const probe = await readLocalIntelProbe(options);

  return probe.logs;
}
