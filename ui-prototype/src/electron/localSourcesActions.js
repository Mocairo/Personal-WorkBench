import { loadLocalSourcesConfig, saveLocalSourcesConfig } from "./localSourcesConfig.js";

const SOURCE_CONFIG_KEYS = {
  "agent-chat": { configKey: "agentChatSession", dialogType: "file" },
  "agent-management": { configKey: "agentManagementConfig", dialogType: "file" },
  "code-repository": { configKey: "codeRepositoryRoot", dialogType: "directory" },
  codeRepositoryPath: { configKey: "codeRepositoryRoot", dialogType: "directory" },
  knowledgeBasePath: { configKey: "knowledgeBaseRoot", dialogType: "directory" },
  "knowledge-base": { configKey: "knowledgeBaseRoot", dialogType: "directory" },
  localIntelPath: { configKey: "localIntelRoot", dialogType: "directory" },
  "local-intel": { configKey: "localIntelRoot", dialogType: "directory" },
  musicLibraryPath: { configKey: "localMusicRoot", dialogType: "directory" },
  "local-music": { configKey: "localMusicRoot", dialogType: "directory" },
  widgets: { configKey: "widgetsDiskRoot", dialogType: "directory" },
};

function getSourceDefinition(sourceId) {
  const source = SOURCE_CONFIG_KEYS[sourceId];
  if (!source) {
    throw new Error(`Unknown local source: ${sourceId}`);
  }

  return source;
}

export function getLocalSourceConfigKey(sourceId) {
  return getSourceDefinition(sourceId).configKey;
}

function toSelectedPath(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function saveLocalSourcePath(sourceId, selectedPath, options = {}) {
  const { configKey } = getSourceDefinition(sourceId);
  const normalizedPath = toSelectedPath(selectedPath);
  if (!normalizedPath) {
    throw new Error("Selected path is required");
  }

  const config = await loadLocalSourcesConfig(options);
  return saveLocalSourcesConfig(
    {
      paths: {
        ...config.paths,
        [configKey]: normalizedPath,
      },
    },
    options,
  );
}

export async function selectLocalSourcePath(sourceId, options = {}) {
  const { dialogType } = getSourceDefinition(sourceId);
  const properties = [dialogType === "file" ? "openFile" : "openDirectory"];

  if (!options.dialog?.showOpenDialog) {
    return { canceled: true, path: null };
  }

  const result = await options.dialog.showOpenDialog({ properties });
  const selectedPath = result?.filePaths?.[0];

  if (result?.canceled || !selectedPath) {
    return { canceled: true, path: null };
  }

  await saveLocalSourcePath(sourceId, selectedPath, options);

  return {
    canceled: false,
    path: selectedPath,
  };
}
