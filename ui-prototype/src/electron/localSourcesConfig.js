import fs from "node:fs/promises";
import path from "node:path";

const PATH_KEYS = new Set([
  "agentChatSession",
  "agentManagementConfig",
  "codeRepositoryRoot",
  "knowledgeBaseRoot",
  "localIntelRoot",
  "localMusicRoot",
  "widgetsDiskRoot",
]);

const PATH_ALIASES = {
  codeRepositoryPath: "codeRepositoryRoot",
  knowledgeBasePath: "knowledgeBaseRoot",
  localIntelPath: "localIntelRoot",
  musicLibraryPath: "localMusicRoot",
};

function toStringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfig(config = {}) {
  const paths = {};
  const inputPaths = config.paths && typeof config.paths === "object" ? config.paths : {};

  for (const [key, value] of Object.entries(inputPaths)) {
    const configKey = PATH_ALIASES[key] ?? key;
    const normalizedValue = toStringValue(value);
    if (PATH_KEYS.has(configKey) && normalizedValue) {
      paths[configKey] = normalizedValue;
    }
  }

  return { paths };
}

export function resolveLocalSourcesConfigPath(options = {}) {
  if (options.configPath) {
    return options.configPath;
  }

  if (process.env.LOCAL_SOURCES_CONFIG) {
    return process.env.LOCAL_SOURCES_CONFIG;
  }

  const rootDir = options.userDataDir ?? path.resolve(".");
  return path.join(rootDir, "config", "local-sources.json");
}

export async function loadLocalSourcesConfig(options = {}) {
  const configPath = resolveLocalSourcesConfigPath(options);

  try {
    const content = await fs.readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch {
    return { paths: {} };
  }
}

export async function saveLocalSourcesConfig(config, options = {}) {
  const configPath = resolveLocalSourcesConfigPath(options);
  const normalizedConfig = normalizeConfig(config);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`);

  return normalizedConfig;
}
