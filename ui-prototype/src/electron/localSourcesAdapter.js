import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSourceHealth, summarizeSourceHealth } from "../shared/sourceStatus.js";
import { DEFAULT_LOCAL_INTEL_ROOT } from "./localIntelAdapter.js";

const PHASE2_REQUIRED_IDS = new Set(["code-repository", "knowledge-base", "local-intel", "local-music"]);

function resolveConfiguredPath(optionValue, envValue, fallbackValue, requiresConfig = false) {
  const configuredPath = optionValue ?? envValue;

  if (configuredPath) {
    return { configured: true, path: configuredPath };
  }

  return {
    configured: !requiresConfig && Boolean(fallbackValue),
    path: requiresConfig ? "" : fallbackValue,
  };
}

function sourceDefinitions(options = {}) {
  const agentChatPath = resolveConfiguredPath(
    options.agentChatSessionPath,
    process.env.AGENT_CHAT_SESSION,
    path.resolve("agent-chat", "session.json"),
  );
  const agentManagementPath = resolveConfiguredPath(
    options.agentManagementConfigPath,
    process.env.AGENT_MANAGEMENT_CONFIG,
    path.resolve("agents", "agents.json"),
  );
  const knowledgeBasePath = resolveConfiguredPath(
    options.knowledgeBaseRootDir,
    process.env.KNOWLEDGE_BASE_ROOT,
    path.resolve("docs"),
    true,
  );
  const codeRepositoryPath = resolveConfiguredPath(
    options.codeRepositoryRootDir,
    process.env.CODE_REPOSITORY_ROOT,
    process.cwd(),
    true,
  );
  const localMusicPath = resolveConfiguredPath(
    options.localMusicRootDir,
    process.env.LOCAL_MUSIC_ROOT,
    path.join(os.homedir(), "Music"),
    true,
  );
  const localIntelPath = resolveConfiguredPath(
    options.localIntelRootDir,
    process.env.LOCAL_INTEL_ROOT,
    DEFAULT_LOCAL_INTEL_ROOT,
    true,
  );
  const widgetsDiskPath = resolveConfiguredPath(
    options.widgetsDiskRoot,
    process.env.WIDGETS_DISK_ROOT,
    process.cwd(),
  );

  return [
    {
      ...agentChatPath,
      id: "agent-chat",
      module: "Agent Chat",
      label: "Local session",
      type: "file",
    },
    {
      ...agentManagementPath,
      id: "agent-management",
      module: "Agent Management",
      label: "Agent config",
      type: "file",
    },
    {
      ...knowledgeBasePath,
      id: "knowledge-base",
      module: "Knowledge Base",
      label: "Docs root",
      type: "directory",
    },
    {
      ...codeRepositoryPath,
      id: "code-repository",
      module: "Code Repository",
      label: "Repository root",
      type: "directory",
    },
    {
      ...localMusicPath,
      id: "local-music",
      module: "Local Music",
      label: "Music Library",
      type: "directory",
    },
    {
      ...localIntelPath,
      id: "local-intel",
      module: "Intel Center",
      label: "local-intel workspace",
      type: "directory",
    },
    {
      ...widgetsDiskPath,
      id: "widgets",
      module: "Widgets",
      label: "Disk metric root",
      type: "directory",
    },
  ];
}

function expectedTypeMatches(stat, type) {
  return type === "file" ? stat.isFile() : stat.isDirectory();
}

async function getSourceState(source) {
  if (!source.configured && PHASE2_REQUIRED_IDS.has(source.id)) {
    const health = buildSourceHealth({
      configured: false,
      id: source.id,
      label: source.label,
      path: "",
      status: "unconfigured",
    });

    return {
      ...source,
      ...health,
      detail: health.message,
      readable: false,
      state: health.status,
      tone: "warm",
    };
  }

  try {
    const stat = await fs.stat(source.path);

    if (!expectedTypeMatches(stat, source.type)) {
      const health = buildSourceHealth({
        configured: source.configured,
        id: source.id,
        label: source.label,
        path: source.path,
        reason: `Expected ${source.type}`,
        status: "error",
      });

      return {
        ...source,
        ...health,
        detail: health.message,
        readable: false,
        state: health.status,
        tone: "warm",
      };
    }

    await fs.access(source.path, fs.constants.R_OK);
    const health = buildSourceHealth({
      configured: source.configured,
      id: source.id,
      label: source.label,
      path: source.path,
      readable: true,
    });

    return {
      ...source,
      ...health,
      detail: source.type === "file" ? "File ready" : "Directory ready",
      readable: true,
      state: health.status,
      tone: "good",
    };
  } catch (error) {
    const missing = error?.code === "ENOENT";
    const health = buildSourceHealth({
      configured: source.configured,
      id: source.id,
      label: source.label,
      path: source.path,
      readable: false,
      reason: missing ? "Path not found" : "Read access unavailable",
      status: missing ? "missing" : "error",
    });

    return {
      ...source,
      ...health,
      detail: health.message,
      readable: false,
      state: health.status,
      tone: "warm",
    };
  }
}

function buildSummary(sources) {
  const sourceSummary = summarizeSourceHealth(sources);
  return {
    missing: sources.filter((source) => source.state === "missing").length,
    ready: sources.filter((source) => source.state === "ready").length,
    total: sources.length,
    unconfigured: sourceSummary.unconfigured,
    unreadable: sources.filter((source) => source.state === "error").length,
  };
}

export async function getLocalSourcesData(options = {}) {
  const sources = await Promise.all(sourceDefinitions(options).map(getSourceState));

  return {
    summary: buildSummary(sources),
    sources,
  };
}
