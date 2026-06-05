import { pages } from "../data/pageRegistry.js";
import {
  buildKnowledgeChunkPreview,
  buildKnowledgeDocument,
  buildKnowledgeSearchResult,
} from "../shared/knowledgeContracts.js";
import {
  buildIntelDashboardSummary,
  buildIntelLogEntry,
  buildIntelReport,
  buildIntelSourceHealth,
  buildIntelWorkspaceStatus,
} from "../shared/intelContracts.js";
import {
  buildAgentContextPack,
  buildAgentDraftMessage,
  buildAgentDryRunResult,
  buildToolPlanPreview,
  redactDryRunText,
} from "../shared/agentDryRunContracts.js";
import {
  buildDryRunResult,
  buildLlmModelProfile,
  buildLlmProviderProfile,
  buildPermissionRequest,
  buildSecretStatus,
} from "../shared/llmSecurityContracts.js";
import { buildProviderStatus, buildSourceHealth } from "../shared/sourceStatus.js";
import {
  agents,
  audioMetadata,
  chatMessages,
  clipboardItems,
  collectionSteps,
  contextItems,
  graphNodes,
  homeTasks,
  intelCards,
  intelSources,
  knowledgeDocuments,
  permissionMetrics,
  recentActivities,
  repoFiles,
  serviceState,
  systemMetrics,
  toolCalls,
  tracks,
} from "../data/mockData.js";

export const providerName = "mock";
const mockAttachedKnowledgeContexts = [];

function mockSourceHealth(id, label) {
  return buildSourceHealth({ id, label, mock: true, path: "" });
}

function mockProviderStatus(sourceId, label) {
  return buildProviderStatus({
    configured: false,
    message: `Using mock data until ${label} is configured`,
    sourceId,
    status: "mock",
  });
}

function getMockLlmProvidersData() {
  return [
    buildLlmProviderProfile({
      id: "mock-openai-compatible",
      label: "OpenAI-compatible",
      message: "Using mock provider status until a local provider is configured",
      model: "not configured",
      provider: "openai-compatible",
      source: "mock",
      status: "mock",
    }),
  ];
}

function getMockLlmModelsData() {
  return [
    buildLlmModelProfile({
      label: "Model status",
      model: "not configured",
      provider: "openai-compatible",
      source: "mock",
      status: "mock",
    }),
  ];
}

function getMockSecretStatusesData() {
  return [
    buildSecretStatus({
      id: "llm-provider",
      label: "LLM Provider",
      provider: "openai-compatible",
      source: "mock",
      status: "mock",
    }),
  ];
}

function getMockPermissionRequestsData() {
  return [
    buildPermissionRequest({
      label: "Local write approval",
      permissionLevel: 2,
      requestId: "mock-permission-local-write",
      source: "mock",
      toolId: "notes.write",
    }),
  ];
}

function getMockKnowledgeDocuments() {
  return knowledgeDocuments.map((doc, index) => {
    const tag = doc.tag ?? "mock";
    return buildKnowledgeDocument({
      chunks: doc.chunks ?? 12 + index,
      id: `mock-kb-doc-${index + 1}`,
      inferredTags: [tag],
      preview: `${doc.title} / ${tag} / mock knowledge preview`,
      relativePath: `mock/${tag}-${index + 1}.md`,
      source: "mock",
      status: doc.state ?? "mock",
      title: doc.title,
      type: "md",
      updatedAt: null,
    });
  });
}

export function getMockHomeDashboardData() {
  return {
    serviceState,
    homeTasks,
    recentActivities,
    quickEntries: pages.slice(1),
  };
}

export async function getHomeDashboard() {
  return getMockHomeDashboardData();
}

export function getMockAgentChatData() {
  return {
    attachedKnowledgeContextCount: mockAttachedKnowledgeContexts.length,
    attachedKnowledgeContexts: mockAttachedKnowledgeContexts,
    chatMessages,
    contextItems,
    llmProviderStatus: getMockLlmProvidersData()[0],
    permissionSummary: getMockPermissionRequestsData()[0],
    toolCalls,
  };
}

export async function getAgentChat() {
  return getMockAgentChatData();
}

export async function prepareAgentChatMessageDraft(input = {}) {
  return buildAgentDraftMessage({
    source: "mock",
    ...input,
  });
}

function getMockAgentChatContextItems(input = {}) {
  const knowledgeItems = getMockKnowledgeDocuments().slice(0, 2).map((doc) => ({
    excerpt: doc.preview,
    relativePath: doc.relativePath,
    source: "mock",
    sourceType: "kb",
    title: doc.title,
  }));
  const repository = getMockCodeRepositoryData();
  const intel = getMockIntelCenterData();

  return [
    ...contextItems.slice(0, 2).map((title) => ({
      excerpt: "Pinned mock session context.",
      source: "mock",
      sourceType: "session",
      title,
    })),
    ...knowledgeItems,
    {
      excerpt: `branch ${repository.gitState.branch}, ${repository.gitState.changed} changed, ${repository.repoFiles.length} files`,
      source: "mock",
      sourceType: "code",
      title: "Repository",
    },
    ...intel.intelCards.slice(0, 1).map((report) => ({
      excerpt: report.summary,
      source: "mock",
      sourceType: "intel",
      title: report.title,
    })),
    {
      excerpt: "tools browser, rag, report; permission ask",
      source: "mock",
      sourceType: "agent",
      title: agents[0]?.name ?? input.agentId ?? "Mock Agent",
    },
  ];
}

export async function previewAgentChatContextPack(input = {}) {
  const draft = buildAgentDraftMessage(input);

  return buildAgentContextPack({
    agentId: draft.agentId,
    items: getMockAgentChatContextItems(input),
    maxItems: input.maxItems ?? 8,
    sessionId: draft.sessionId,
    source: "mock",
  });
}

export async function previewAgentChatToolPlan(input = {}) {
  const text = redactDryRunText(input.userText).toLowerCase();
  const tools = [
    { name: "Knowledge Search", permissionLevel: 1, toolId: "kb.search" },
  ];

  if (/(write|save|note|report|create|update)/.test(text)) {
    tools.push({ name: "Draft Local Note", permissionLevel: 2, toolId: "notes.write" });
  }
  if (/(shell|command|terminal|exec|run|start|stop|network)/.test(text)) {
    tools.push({ name: "Shell Command", permissionLevel: 4, toolId: "shell.exec" });
  }

  return buildToolPlanPreview({
    source: "mock",
    tools,
  });
}

export async function runAgentChatDryMessage(input = {}) {
  const draft = await prepareAgentChatMessageDraft(input);
  const [contextPack, toolPlan] = await Promise.all([
    previewAgentChatContextPack(draft),
    previewAgentChatToolPlan(draft),
  ]);

  return buildAgentDryRunResult({
    contextPack,
    draft,
    toolPlan,
  });
}

export async function sendAgentChatMessage(input = {}) {
  const dryRun = await runAgentChatDryMessage(input);

  return {
    assistantMessage: {
      ...dryRun.mockResponse,
      source: "mock",
      text: dryRun.mockResponse.text,
    },
    contextPack: dryRun.contextPack,
    dryRun: true,
    status: "mock",
    toolCalls: [
      {
        duration: "0ms",
        meta: "mock text fallback",
        permission: "none",
        source: "mock",
        state: "done",
        title: "No tools executed",
      },
    ],
    userMessage: {
      id: dryRun.draft.id,
      role: "user",
      source: "mock",
      status: "sent",
      text: dryRun.draft.userText,
    },
  };
}

export async function streamAgentChatMessage(input = {}, options = {}) {
  const requestId = input.requestId ?? `mock-stream-${Date.now()}`;
  const result = await sendAgentChatMessage(input);
  const text = result.assistantMessage?.text ?? "";

  options.onEvent?.({
    requestId,
    status: "generating",
    type: "start",
  });
  if (text) {
    options.onEvent?.({
      metadata: {
        model: "not configured",
        provider: "mock",
        toolCalls: 0,
      },
      requestId,
      status: "generating",
      text,
      token: text,
      type: "token",
    });
  }
  options.onEvent?.({
    metadata: {
      model: "not configured",
      provider: "mock",
      toolCalls: 0,
    },
    requestId,
    status: "done",
    text,
    type: "done",
  });

  return {
    ...result,
    requestId,
  };
}

export async function cancelAgentChatStream(input = {}) {
  return {
    requestId: input.requestId,
    status: "cancelled",
  };
}

function mockContextId(input = {}) {
  return input.contextId || `${input.documentId || input.id || "mock-doc"}:${input.chunkId || "document"}`;
}

export async function attachKnowledgeContextToAgentChat(input = {}) {
  const context = {
    chunkId: input.chunkId || "",
    contextId: mockContextId(input),
    documentId: input.documentId || input.id || "mock-doc",
    matchType: input.matchType || "document",
    preview: redactDryRunText(input.preview || input.excerpt || "Mock attached knowledge context."),
    relativePath: redactDryRunText(input.relativePath || "mock/attached.md"),
    score: Number.isFinite(input.score) ? input.score : 1,
    sourceType: "knowledge",
    title: redactDryRunText(input.title || "Mock Knowledge Context"),
    updatedAt: input.updatedAt || null,
  };
  const index = mockAttachedKnowledgeContexts.findIndex((item) => item.contextId === context.contextId);
  if (index >= 0) {
    mockAttachedKnowledgeContexts.splice(index, 1, context);
  } else {
    mockAttachedKnowledgeContexts.unshift(context);
  }

  return {
    attachedKnowledgeContexts: mockAttachedKnowledgeContexts,
    sessionId: input.sessionId || "local-session",
    status: "saved",
    total: mockAttachedKnowledgeContexts.length,
  };
}

export async function listAgentChatKnowledgeContexts(input = {}) {
  return {
    attachedKnowledgeContexts: mockAttachedKnowledgeContexts,
    sessionId: input.sessionId || "local-session",
    status: "ready",
    total: mockAttachedKnowledgeContexts.length,
  };
}

export async function removeKnowledgeContextFromAgentChat(input = {}) {
  const contextId = mockContextId(input);
  const index = mockAttachedKnowledgeContexts.findIndex((item) => item.contextId === contextId);
  if (index >= 0) {
    mockAttachedKnowledgeContexts.splice(index, 1);
  }

  return {
    attachedKnowledgeContexts: mockAttachedKnowledgeContexts,
    sessionId: input.sessionId || "local-session",
    status: "removed",
    total: mockAttachedKnowledgeContexts.length,
  };
}

export async function clearAgentChatKnowledgeContexts(input = {}) {
  mockAttachedKnowledgeContexts.splice(0);
  return {
    attachedKnowledgeContexts: [],
    sessionId: input.sessionId || "local-session",
    status: "cleared",
    total: 0,
  };
}

export function getMockKnowledgeBaseData() {
  const documents = getMockKnowledgeDocuments();

  return {
    graphNodes,
    indexStats: {
      chunks: 1248,
      docs: 36,
      pending: 4,
      progress: "82%",
      source: "mock",
    },
    knowledgeDocuments: documents,
    providerStatus: mockProviderStatus("knowledgeBasePath", "Knowledge Base"),
    scanSummary: {
      errors: 0,
      indexed: documents.length,
      scanned: documents.length,
      skipped: 0,
      source: "mock",
      status: "mock",
      updatedAt: null,
    },
    sourceHealth: mockSourceHealth("knowledge-base", "Knowledge Base"),
  };
}

export async function getKnowledgeBase() {
  return getMockKnowledgeBaseData();
}

export async function listKnowledgeDocuments() {
  return getMockKnowledgeDocuments();
}

export async function searchKnowledgeLocal(query = "") {
  const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";
  const documents = getMockKnowledgeDocuments();
  const results = normalizedQuery
    ? documents
        .filter((doc) => `${doc.title} ${doc.relativePath} ${doc.preview} ${doc.tag}`.toLowerCase().includes(normalizedQuery))
        .map((doc) => buildKnowledgeSearchResult({
          excerpt: doc.preview,
          id: doc.id,
          query,
          relativePath: doc.relativePath,
          source: "mock",
          title: doc.title,
          type: doc.type,
        }))
    : [];

  return {
    query,
    results,
    source: "mock",
    total: results.length,
  };
}

export async function startKnowledgeIndex() {
  return {
    source: "mock",
    status: "mock",
    summary: {
      chunks: 0,
      docs: getMockKnowledgeDocuments().length,
      failed: 0,
      indexed: getMockKnowledgeDocuments().length,
      scanned: getMockKnowledgeDocuments().length,
      skipped: 0,
    },
  };
}

export async function getKnowledgeDocumentPreview(documentId) {
  const document = getMockKnowledgeDocuments().find((doc) => doc.id === documentId) ?? getMockKnowledgeDocuments()[0];

  return {
    ...document,
    source: "mock",
    chunkPreviews: [
      buildKnowledgeChunkPreview({
        documentId: document.id,
        preview: document.preview,
        relativePath: document.relativePath,
        source: "mock",
        title: document.title,
      }),
    ],
  };
}

export function getMockAgentManagementData() {
  return {
    agents,
    llmProviders: getMockLlmProvidersData(),
    permissionMetrics,
    permissionRequests: getMockPermissionRequestsData(),
  };
}

export async function getAgentManagement() {
  return getMockAgentManagementData();
}

export async function listLlmProviders() {
  return getMockLlmProvidersData();
}

export async function listLlmModels() {
  return getMockLlmModelsData();
}

export async function getLlmProviderStatus() {
  return getMockLlmProvidersData()[0];
}

export async function validateLlmProviderConfig(config = {}) {
  const provider = buildLlmProviderProfile({
    ...config,
    source: "mock",
    status: config.provider ? "ready" : "unconfigured",
  });

  return {
    dryRun: true,
    hasSecret: provider.hasSecret,
    message: provider.message,
    model: provider.model,
    provider: provider.provider,
    secretHint: provider.secretHint,
    source: "mock",
    status: provider.status,
  };
}

export async function sendLlmTextMessage(input = {}) {
  const draft = await prepareAgentChatMessageDraft(input);

  return {
    metadata: {
      model: "not configured",
      provider: "mock",
      toolCalls: 0,
    },
    role: "assistant",
    source: "mock",
    text: `Mock text reply for: ${draft.userText}`,
  };
}

export async function listPermissionRequests() {
  return getMockPermissionRequestsData();
}

export async function evaluateToolRequest(request = {}) {
  return buildDryRunResult(request);
}

export async function dryRunTool(request = {}) {
  return buildDryRunResult(request);
}

export function getMockCodeRepositoryData() {
  return {
    repoFiles: repoFiles.map((file, index) => ({
      depth: 0,
      id: `mock-repo-${index + 1}`,
      meta: file.meta,
      name: file.name,
      relativePath: file.name,
      source: "mock",
      state: index === 0 ? "selected" : "clean",
      type: file.meta?.includes("directory") ? "directory" : "file",
    })),
    repoMetrics: {
      modules: 28,
      symbols: 412,
      changed: 2,
      fileCount: repoFiles.length,
    },
    gitState: {
      branch: "main",
      changed: 2,
      modified: 2,
      staged: 0,
      statusLabel: "2 changes",
      untracked: 0,
      status: "ready",
    },
    providerStatus: mockProviderStatus("codeRepositoryPath", "Code Repository"),
    repositorySource: {
      branch: "main",
      configured: false,
      fileCount: repoFiles.length,
      id: "mock-root",
      name: "Mock Repository",
      path: "",
      source: "mock",
      status: "mock",
      updatedAt: null,
    },
    scanSummary: {
      errors: 0,
      scanned: repoFiles.length,
      skipped: 0,
      source: "mock",
      status: "mock",
      updatedAt: null,
    },
    sourceHealth: mockSourceHealth("code-repository", "Code Repository"),
    structureNodes: [
      { id: "mock-shell", label: "Shell", source: "mock", type: "directory", value: 1 },
      { id: "mock-pages", label: "Pages", source: "mock", type: "directory", value: 1 },
    ],
  };
}

export async function getCodeRepository() {
  return getMockCodeRepositoryData();
}

export async function listCodeRepositoryFiles() {
  return getMockCodeRepositoryData().repoFiles;
}

export async function getCodeRepositoryMetrics() {
  return getMockCodeRepositoryData().repoMetrics;
}

export async function getCodeRepositoryStructure() {
  return getMockCodeRepositoryData().structureNodes;
}

export function getMockLocalMusicData() {
  return {
    audioMetadata,
    providerStatus: mockProviderStatus("musicLibraryPath", "Music Library"),
    sourceHealth: mockSourceHealth("local-music", "Music Library"),
    tracks,
  };
}

export async function getLocalMusic() {
  return getMockLocalMusicData();
}

export function getMockIntelCenterData() {
  const reports = intelCards.map((card, index) => buildIntelReport({
    priority: card.priority,
    reportId: `mock-intel-${index + 1}`,
    source: "mock",
    status: "mock",
    summary: `${card.source ?? "mock source"} / ${card.state ?? "summary ready"}`,
    tags: ["mock"],
    title: card.title,
  }));

  return {
    collectionSteps,
    intelCards: reports,
    intelLogs: [
      buildIntelLogEntry({
        level: "info",
        message: "mock local-intel log ready",
        source: "mock",
        status: "mock",
      }),
    ],
    intelSources: intelSources.map((source, index) => buildIntelSourceHealth({
      checks: index + 1,
      label: source,
      source: "mock",
      status: "mock",
    })),
    providerStatus: mockProviderStatus("localIntelPath", "local-intel"),
    sourceHealth: mockSourceHealth("local-intel", "local-intel"),
    workspaceStatus: buildIntelWorkspaceStatus({
      configured: false,
      reportCount: reports.length,
      source: "mock",
      status: "mock",
    }),
  };
}

export async function getIntelCenter() {
  return getMockIntelCenterData();
}

export async function getIntelServiceStatus() {
  return {
    serviceId: "local-intel",
    status: "mock",
    workspaceConfigured: false,
  };
}

export async function getIntelDashboardSummary() {
  return buildIntelDashboardSummary({
    reportCount: getMockIntelCenterData().intelCards.length,
    source: "mock",
    state: "mock",
    status: "mock",
  });
}

export async function getIntelSourceHealth() {
  return getMockIntelCenterData().intelSources;
}

export async function listIntelReports() {
  return getMockIntelCenterData().intelCards;
}

export async function listIntelLogs() {
  return getMockIntelCenterData().intelLogs;
}

export function getMockWidgetsData() {
  return {
    clipboardItems,
    systemMetrics,
  };
}

export async function getWidgets() {
  return getMockWidgetsData();
}

export function getMockSettingsData() {
  const sources = [
    {
      detail: "File ready",
      id: "agent-chat",
      label: "Local session",
      module: "Agent Chat",
      path: "agent-chat/session.json",
      readable: true,
      state: "ready",
      tone: "good",
      type: "file",
    },
    {
      detail: "File ready",
      id: "agent-management",
      label: "Agent config",
      module: "Agent Management",
      path: "agents/agents.json",
      readable: true,
      state: "ready",
      tone: "good",
      type: "file",
    },
    {
      configured: false,
      detail: "Using mock data",
      id: "knowledge-base",
      label: "Docs root",
      module: "Knowledge Base",
      message: "Using mock data",
      path: "",
      readable: false,
      state: "mock",
      status: "mock",
      tone: "cool",
      type: "directory",
    },
    {
      configured: false,
      detail: "Using mock data",
      id: "code-repository",
      label: "Code Repository",
      message: "Using mock data",
      module: "Code Repository",
      path: "",
      readable: false,
      state: "mock",
      status: "mock",
      tone: "cool",
      type: "directory",
    },
    {
      configured: false,
      detail: "Using mock data",
      id: "local-intel",
      label: "local-intel",
      message: "Using mock data",
      module: "Intel Center",
      path: "",
      readable: false,
      state: "mock",
      status: "mock",
      tone: "cool",
      type: "directory",
    },
    {
      configured: false,
      detail: "Using mock data",
      id: "local-music",
      label: "Music Library",
      message: "Using mock data",
      module: "Local Music",
      path: "",
      readable: false,
      state: "mock",
      status: "mock",
      tone: "cool",
      type: "directory",
    },
  ];

  return {
    llmModels: getMockLlmModelsData(),
    llmProviders: getMockLlmProvidersData(),
    secrets: getMockSecretStatusesData(),
    sources,
    summary: {
      missing: 0,
      mock: 4,
      ready: 2,
      total: sources.length,
      unconfigured: 0,
      unreadable: 0,
    },
  };
}

export async function getSettings() {
  return getMockSettingsData();
}

export async function selectLocalSourcePath() {
  return {
    canceled: true,
    settings: getMockSettingsData(),
  };
}

export async function saveLocalSourcePath() {
  return getMockSettingsData();
}
