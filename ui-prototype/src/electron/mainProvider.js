import fs from "node:fs/promises";
import path from "node:path";
import * as mockProvider from "../services/mockProvider.js";
import { redactSecretText } from "../shared/llmSecurityContracts.js";
import { buildProviderStatus, buildSourceHealth } from "../shared/sourceStatus.js";
import { getAgentChatData } from "./agentChatAdapter.js";
import { buildAgentLlmContext } from "./agentContextBuilder.js";
import {
  prepareMessageDraft,
  previewContextPack,
  previewToolPlan,
  runDryMessage,
} from "./agentDryRunAdapter.js";
import { runAgentLoop } from "./agentLoop.js";
import { runAgentToolLoop } from "./agentToolOrchestrator.js";
import { redactAgentToolText } from "./agentToolRegistry.js";
import { getAgentManagementData } from "./agentManagementAdapter.js";
import {
  getCodeRepositoryData,
  getCodeRepositoryFiles,
  getCodeRepositoryMetrics,
  getCodeRepositoryStructure,
} from "./codeRepositoryAdapter.js";
import { getHomeDashboardData } from "./homeDashboardAdapter.js";
import {
  getKnowledgeBaseData,
  getKnowledgeDocumentPreview as getKnowledgeDocumentPreviewData,
  getKnowledgeFileTree,
  reindexKnowledgeBase,
  searchKnowledgeLocal,
} from "./knowledgeBaseAdapter.js";
import { readKnowledgeIndex } from "./knowledgeIndexStore.js";
import {
  addAgentKnowledgeContext as addStoredAgentKnowledgeContext,
  clearAgentKnowledgeContexts as clearStoredAgentKnowledgeContexts,
  listAgentKnowledgeContexts as listStoredAgentKnowledgeContexts,
  removeAgentKnowledgeContext as removeStoredAgentKnowledgeContext,
} from "./agentKnowledgeContextStore.js";
import {
  getLocalIntelCenterData,
  getLocalIntelDashboardSummary,
  getLocalIntelServiceStatus,
  getLocalIntelSourceHealth,
  listLocalIntelLogs,
  listLocalIntelReports,
} from "./localIntelAdapter.js";
import { getLocalMusicData } from "./localMusicAdapter.js";
import {
  getLlmProviderStatus,
  listLlmModels,
  listLlmProviders,
  listLlmSecretStatuses,
  sendLlmTextMessage as sendAdapterLlmTextMessage,
  streamLlmTextMessage as streamAdapterLlmTextMessage,
  validateProviderConfig,
} from "./llmProviderAdapter.js";
import {
  appendAgentChatSessionTurn,
  resetAgentChatUserDataSession,
  restoreAgentChatUserDataSession,
} from "./agentChatSessionStore.js";
import { isApiResult } from "./apiResult.js";
import { loadLlmPublicConfig } from "./llmEnvLoader.js";
import {
  saveLocalSourcePath,
  selectLocalSourcePath,
} from "./localSourcesActions.js";
import { loadLocalSourcesConfig } from "./localSourcesConfig.js";
import { getLocalSourcesData } from "./localSourcesAdapter.js";
import {
  decidePermissionRequest,
  dryRunTool,
  evaluateToolRequest,
  executeTool,
  listPermissionRequests,
} from "./permissionAdapter.js";
import { getWidgetsData } from "./widgetsAdapter.js";

async function getConfiguredPaths(options) {
  const config = await loadLocalSourcesConfig({
    configPath: options.localSourcesConfigPath,
    userDataDir: options.userDataDir,
  });
  const paths = config.paths;

  return {
    agentChatSessionPath: options.agentChatSessionPath ?? paths.agentChatSession,
    agentManagementConfigPath: options.agentManagementConfigPath ?? paths.agentManagementConfig,
    codeRepositoryRootDir: options.codeRepositoryRootDir ?? paths.codeRepositoryRoot,
    knowledgeBaseRootDir: options.knowledgeBaseRootDir ?? paths.knowledgeBaseRoot,
    localIntelRootDir: options.localIntelRootDir ?? paths.localIntelRoot,
    localMusicRootDir: options.localMusicRootDir ?? paths.localMusicRoot,
    widgetsDiskRoot: options.widgetsDiskRoot ?? paths.widgetsDiskRoot,
  };
}

const PHASE2_SOURCE_META = {
  codeRepository: {
    pathKey: "codeRepositoryRootDir",
    rowId: "code-repository",
    sourceId: "codeRepositoryPath",
  },
  intel: {
    pathKey: "localIntelRootDir",
    rowId: "local-intel",
    sourceId: "localIntelPath",
  },
  knowledge: {
    pathKey: "knowledgeBaseRootDir",
    rowId: "knowledge-base",
    sourceId: "knowledgeBasePath",
  },
  music: {
    pathKey: "localMusicRootDir",
    rowId: "local-music",
    sourceId: "musicLibraryPath",
  },
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findSourceHealth(settings, meta) {
  return (
    settings.sources.find((source) => source.id === meta.rowId) ??
    buildSourceHealth({
      configured: false,
      id: meta.rowId,
      label: meta.rowId,
      path: "",
      status: "unconfigured",
    })
  );
}

function findKnowledgeAttachment(index = {}, input = {}) {
  const id = cleanString(input.id);
  const requestedChunkId = cleanString(input.chunkId) || id;
  const requestedDocumentId = cleanString(input.documentId) || id;
  const chunk = requestedChunkId
    ? index.chunks?.find((item) => item.chunkId === requestedChunkId || item.id === requestedChunkId)
    : null;
  const documentId = chunk?.documentId || requestedDocumentId;
  const document = documentId
    ? index.documents?.find((item) => item.id === documentId || item.documentId === documentId)
    : null;

  if (chunk) {
    return {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      matchType: cleanString(input.matchType) || "chunk",
      preview: chunk.preview,
      relativePath: chunk.relativePath || document?.relativePath,
      score: Number.isFinite(input.score) ? input.score : 1,
      sourceType: "knowledge",
      title: chunk.title || document?.title || chunk.relativePath,
      updatedAt: chunk.updatedAt || document?.updatedAt,
    };
  }

  if (document) {
    return {
      documentId: document.id,
      matchType: cleanString(input.matchType) || "document",
      preview: document.preview,
      relativePath: document.relativePath,
      score: Number.isFinite(input.score) ? input.score : 1,
      sourceType: "knowledge",
      title: document.title,
      updatedAt: document.updatedAt,
    };
  }

  return null;
}

function buildFallbackKnowledgeAttachment(input = {}) {
  const preview = cleanString(input.preview ?? input.excerpt ?? input.summary ?? input.selectedText);
  const title = cleanString(input.title ?? input.label ?? input.relativePath ?? input.documentId);
  const relativePath = cleanString(input.relativePath ?? input.path);
  const contextId = cleanString(input.contextId);

  if (!preview && !title && !relativePath) {
    return null;
  }

  return {
    ...(contextId ? { contextId } : {}),
    ...(cleanString(input.chunkId) ? { chunkId: cleanString(input.chunkId) } : {}),
    ...(cleanString(input.documentId ?? input.id) ? { documentId: cleanString(input.documentId ?? input.id) } : {}),
    matchType: cleanString(input.matchType) || (preview ? "selection" : "document"),
    preview,
    relativePath,
    score: Number.isFinite(input.score) ? input.score : 1,
    sourceType: "knowledge",
    title: title || "Knowledge selection",
    updatedAt: cleanString(input.updatedAt),
  };
}

function attachSourceStatus(data, meta, sourceHealth, useMock) {
  const status = useMock ? "mock" : sourceHealth.status;
  const message = useMock
    ? `Using mock data until ${sourceHealth.label} is configured`
    : sourceHealth.message;

  return {
    ...data,
    providerStatus: buildProviderStatus({
      configured: !useMock && sourceHealth.configured,
      message,
      sourceId: meta.sourceId,
      status,
    }),
    sourceHealth,
  };
}

function canReadLocalSource(sourceHealth) {
  return sourceHealth.configured && sourceHealth.status === "ready";
}

function noToolsExecutedStep(source = "llm") {
  return {
    duration: "0ms",
    meta: "text-only reply",
    permission: "none",
    source,
    state: "done",
    title: "No tools executed",
  };
}

function sanitizeLlmMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const sanitized = {};
  for (const key of ["completionId", "finishReason", "model", "provider"]) {
    if (metadata[key]) {
      sanitized[key] = redactSecretText(String(metadata[key]));
    }
  }
  if (Number.isFinite(metadata.toolCalls)) {
    sanitized.toolCalls = metadata.toolCalls;
  }
  if (metadata.usage && typeof metadata.usage === "object") {
    sanitized.usage = {
      completionTokens: metadata.usage.completionTokens,
      promptTokens: metadata.usage.promptTokens,
      totalTokens: metadata.usage.totalTokens,
    };
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function withContextProviderMetadata(contextSummary, metadata) {
  if (!contextSummary) {
    return null;
  }

  const providerMetadata = sanitizeLlmMetadata(metadata) ?? contextSummary.providerMetadata ?? null;

  return {
    ...contextSummary,
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

function citationMetadataFromContextSummary(contextSummary = {}) {
  const refs = Array.isArray(contextSummary?.sourceRefs) ? contextSummary.sourceRefs : [];

  return refs.slice(0, 8).map((ref) => ({
    ...(cleanString(ref.chunkId) ? { chunkId: redactAgentToolText(ref.chunkId) } : {}),
    ...(cleanString(ref.documentId) ? { documentId: redactAgentToolText(ref.documentId) } : {}),
    ...(cleanString(ref.matchType) ? { matchType: redactAgentToolText(ref.matchType) } : {}),
    ...(cleanString(ref.preview) ? { preview: redactAgentToolText(ref.preview) } : {}),
    ...(cleanString(ref.relativePath) ? { relativePath: redactAgentToolText(ref.relativePath) } : {}),
    ...(Number.isFinite(ref.score) ? { score: ref.score } : {}),
    sourceRefId: cleanString(ref.sourceRefId) || `S${refs.indexOf(ref) + 1}`,
    sourceType: redactAgentToolText(cleanString(ref.sourceType) || "knowledge"),
    title: redactAgentToolText(cleanString(ref.title) || cleanString(ref.relativePath) || "Source"),
  }));
}

function withAssistantCitations(metadata, contextSummary) {
  const citations = citationMetadataFromContextSummary(contextSummary);
  const baseMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const assistantMetadata = {
    ...baseMetadata,
    ...(citations.length > 0 ? { citations } : {}),
  };

  return Object.keys(assistantMetadata).length > 0 ? assistantMetadata : null;
}

function getToolPolicy(input = {}) {
  const explicitPolicy = input.toolPolicy && typeof input.toolPolicy === "object" ? input.toolPolicy : {};
  const approvedToolIds = new Set([
    ...(Array.isArray(input.approvedToolIds) ? input.approvedToolIds : []),
    ...(Array.isArray(explicitPolicy.approvedToolIds) ? explicitPolicy.approvedToolIds : []),
  ]);
  if (explicitPolicy.autoAllowKnowledgeSearch !== false && input.autoAllowKnowledgeSearch !== false) {
    approvedToolIds.add("kb.searchLocal");
  }

  return {
    approveAllLevel1: Boolean(input.approveAllLevel1),
    approvedToolCallIds: Array.isArray(input.approvedToolCallIds) ? input.approvedToolCallIds : [],
    approvedToolIds: Array.from(approvedToolIds),
    autoAllowLevel1ReadOnly: Boolean(input.autoAllowLevel1ReadOnly),
    ...explicitPolicy,
    approvedToolIds: Array.from(approvedToolIds),
  };
}

function getToolLoopPayload(toolLoop = {}) {
  return {
    toolCalls: Array.isArray(toolLoop.toolCalls) && toolLoop.toolCalls.length > 0
      ? toolLoop.toolCalls
      : [noToolsExecutedStep("llm")],
    ...(Array.isArray(toolLoop.toolDecisions) && toolLoop.toolDecisions.length > 0 ? { toolDecisions: toolLoop.toolDecisions } : {}),
    ...(toolLoop.toolPlan?.items?.length > 0 ? { toolPlan: toolLoop.toolPlan } : {}),
    ...(Array.isArray(toolLoop.toolResultsSummary) && toolLoop.toolResultsSummary.length > 0
      ? { toolResultsSummary: toolLoop.toolResultsSummary }
      : {}),
  };
}

function filterAgentChatLlmContextPack(contextPack = {}) {
  return {
    ...contextPack,
    items: (Array.isArray(contextPack.items) ? contextPack.items : []).filter((item) => (
      item?.sourceType === "tool" ||
      item?.type === "tool" ||
      item?.source === "tool" ||
      item?.sourceType === "session" ||
      item?.type === "session"
    )),
  };
}

function sanitizeAssistantAnswerText(value, contextSummary = {}) {
  const text = redactAgentToolText(value ?? "");
  if (!/<tool_call|<function=/i.test(text)) {
    return text;
  }

  const query = text.match(/<parameter\s*=\s*query>\s*([^<]+?)\s*<\/parameter>/i)?.[1]
    ?? text.match(/query["']?\s*[:=]\s*["']?([^"'<\n]+)/i)?.[1]
    ?? "";
  const sourceCount = Array.isArray(contextSummary.sourceRefs) ? contextSummary.sourceRefs.length : 0;
  const queryText = query ? `“${redactAgentToolText(query)}”` : "相关内容";

  return [
    `我已拦截模型返回的工具调用草稿，没有把原始 tool_call 展示出来。`,
    `本轮会继续以知识库检索 ${queryText} 为依据回答。`,
    sourceCount > 0 ? `可参考下方 ${sourceCount} 个来源引用。` : "如果需要更完整结果，请直接追问要展开的部分。",
  ].join(" ");
}

function buildToolGateAgentChatResult({ contextPack, contextSummary, draft, requestId, status, toolLoop }) {
  const message = status === "tool_error"
    ? "A read-only tool returned an error. Tool details are available in the timeline."
    : status === "denied"
      ? "The requested tools are not allowed in this read-only phase."
      : "Approve the planned Level 1 read-only tools to continue.";

  return {
    assistantMessage: {
      id: `tool-agent-${draft.id}`,
      role: "assistant",
      source: "tool-plan",
      status,
      text: message,
    },
    ...(contextSummary ? { contextSummary } : {}),
    contextPack,
    ...(requestId ? { requestId } : {}),
    status,
    ...getToolLoopPayload(toolLoop),
    userMessage: {
      id: draft.id,
      role: "user",
      source: "local",
      status: "sent",
      text: draft.userText,
    },
  };
}

function buildToolLlmErrorResult({ contextPack, contextSummary, draft, llmResult, requestId, toolLoop }) {
  const error = isApiResult(llmResult) ? llmResult.error : llmResult?.error;
  const message = redactAgentToolText(error?.message || "LLM request failed after read-only tools completed.");

  return {
    assistantMessage: {
      id: `llm-error-${draft.id}`,
      metadata: withAssistantCitations(null, contextSummary),
      role: "assistant",
      source: "llm",
      status: "error",
      text: `Tool results are available, but the final LLM summary failed. ${message}`,
    },
    ...(contextSummary ? { contextSummary } : {}),
    contextPack,
    error: {
      code: redactAgentToolText(error?.code || "LLM_REQUEST_FAILED"),
      message,
      retryable: Boolean(error?.retryable),
    },
    ...(requestId ? { requestId } : {}),
    status: "error",
    ...getToolLoopPayload(toolLoop),
    userMessage: {
      id: draft.id,
      role: "user",
      source: "local",
      status: "sent",
      text: draft.userText,
    },
  };
}

function buildAgentChatLlmResult({ contextPack, contextSummary, draft, llmData, requestId, toolLoop }) {
  const metadata = sanitizeLlmMetadata(llmData?.metadata);
  const status = llmData?.status === "cancelled" ? "cancelled" : "ready";
  const toolPayload = getToolLoopPayload(toolLoop);
  const finalContextSummary = withContextProviderMetadata(contextSummary, metadata);
  const assistantText = sanitizeAssistantAnswerText(llmData?.text ?? "", finalContextSummary);
  const assistantMetadata = withAssistantCitations(metadata, finalContextSummary);

  return {
    assistantMessage: {
      id: llmData?.id ?? `llm-agent-${draft.id}`,
      metadata: assistantMetadata,
      role: "assistant",
      source: "llm",
      status,
      text: assistantText,
    },
    ...(finalContextSummary ? { contextSummary: finalContextSummary } : {}),
    contextPack,
    llm: {
      metadata,
      provider: metadata?.provider ?? null,
    },
    ...(requestId ? { requestId } : {}),
    status,
    ...toolPayload,
    userMessage: {
      id: draft.id,
      role: "user",
      source: "local",
      status: "sent",
      text: draft.userText,
    },
  };
}

export function createMainDataProvider(options = {}) {
  const configOptions = {
    configPath: options.localSourcesConfigPath,
    userDataDir: options.userDataDir,
  };
  const activeAgentChatStreams = new Map();
  async function getKnowledgeSourceContext() {
    const paths = await getConfiguredPaths(options);
    const settings = await provider.getSettings();
    const sourceHealth = findSourceHealth(settings, PHASE2_SOURCE_META.knowledge);

    return { paths, sourceHealth };
  }
  async function getCodeRepositorySourceContext() {
    const paths = await getConfiguredPaths(options);
    const settings = await provider.getSettings();
    const sourceHealth = findSourceHealth(settings, PHASE2_SOURCE_META.codeRepository);

    return { paths, sourceHealth };
  }
  async function getLlmPublicConfig() {
    return loadLlmPublicConfig({
      envPath: options.llmEnvPath,
      processEnv: options.processEnv,
    });
  }
  function getAgentChatContextLimits() {
    return {
      ...(Number.isFinite(options.agentChatContextPackMaxItems)
        ? { maxItems: options.agentChatContextPackMaxItems }
        : {}),
      ...(options.agentChatContextLimits && typeof options.agentChatContextLimits === "object"
        ? options.agentChatContextLimits
        : {}),
    };
  }
  function getKnowledgeEmbeddingOptions() {
    return {
      ...(options.embedTexts ? { embedTexts: options.embedTexts } : {}),
      ...(options.embeddingConfig ? { embeddingConfig: options.embeddingConfig } : {}),
      ...(options.embeddingMaxBatchSize ? { embeddingMaxBatchSize: options.embeddingMaxBatchSize } : {}),
      ...(options.embeddingMaxInputChars ? { embeddingMaxInputChars: options.embeddingMaxInputChars } : {}),
      ...(options.embeddingPythonPath ? { embeddingPythonPath: options.embeddingPythonPath } : {}),
      ...(options.embeddingRuntimeClient ? { embeddingRuntimeClient: options.embeddingRuntimeClient } : {}),
      ...(options.embeddingSpawn ? { embeddingSpawn: options.embeddingSpawn } : {}),
      ...(options.embeddingTimeoutMs ? { embeddingTimeoutMs: options.embeddingTimeoutMs } : {}),
      ...(options.embeddingTransport ? { embeddingTransport: options.embeddingTransport } : {}),
    };
  }
  function getContextStoreOptions() {
    return {
      userDataDir: options.userDataDir,
    };
  }
  function selectAgentForContext(agentManagement = {}, draft = {}, agentChat = {}) {
    const agents = Array.isArray(agentManagement.agents) ? agentManagement.agents : [];
    const targetId = draft.agentId || agentChat.session?.activeAgentId;

    return agents.find((agent) => (
      agent.id === targetId ||
      agent.agentId === targetId ||
      agent.name === targetId
    )) ?? agents[0] ?? null;
  }
  async function getAgentManagementContextData() {
    const paths = await getConfiguredPaths(options);

    return getAgentManagementData({
      configPath: paths.agentManagementConfigPath,
      rootDir: options.agentManagementRootDir,
    }).catch(() => ({}));
  }
  async function buildAgentChatLlmContextPayload({ contextPack, draft, toolResultsSummary }) {
    const [agentChat, agentManagement, providerMetadata] = await Promise.all([
      provider.getAgentChat().catch(() => ({})),
      getAgentManagementContextData(),
      provider.getLlmProviderStatus().catch(() => ({})),
    ]);

    return buildAgentLlmContext(
      {
        agentConfig: selectAgentForContext(agentManagement, draft, agentChat),
        attachedKnowledgeContexts: agentChat.attachedKnowledgeContexts,
        contextPack: filterAgentChatLlmContextPack(contextPack),
        providerMetadata,
        session: agentChat,
        toolResultsSummary,
        userText: draft.userText,
      },
      getAgentChatContextLimits(),
    );
  }
  async function resolveAgentKnowledgeContextSessionId(input = {}) {
    const requestedSessionId = cleanString(input.sessionId);
    if (requestedSessionId && requestedSessionId !== "local-session") {
      return requestedSessionId;
    }

    if (!options.userDataDir) {
      return requestedSessionId || "local-session";
    }

    try {
      const paths = await getConfiguredPaths(options);
      const agentChat = await getAgentChatData({
        rootDir: options.agentChatRootDir,
        sessionPath: paths.agentChatSessionPath,
        userDataDir: options.userDataDir,
      });
      return cleanString(agentChat.session?.sessionId) || requestedSessionId || "local-session";
    } catch {
      return requestedSessionId || "local-session";
    }
  }
  function mergeAgentKnowledgeContextLists(primary = {}, fallback = null) {
    if (!fallback || primary.sessionId === fallback.sessionId) {
      return primary;
    }

    const seen = new Set();
    const attachedKnowledgeContexts = [
      ...(Array.isArray(primary.attachedKnowledgeContexts) ? primary.attachedKnowledgeContexts : []),
      ...(Array.isArray(fallback.attachedKnowledgeContexts) ? fallback.attachedKnowledgeContexts : []),
    ].filter((context) => {
      const id = cleanString(context?.contextId);
      if (!id || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

    return {
      ...primary,
      attachedKnowledgeContexts,
      total: attachedKnowledgeContexts.length,
    };
  }
  async function listResolvedAgentKnowledgeContexts(input = {}) {
    const sessionId = await resolveAgentKnowledgeContextSessionId(input);
    const primary = await listStoredAgentKnowledgeContexts({
      ...input,
      sessionId,
    }, getContextStoreOptions());

    if (sessionId === "local-session") {
      return primary;
    }

    const fallback = await listStoredAgentKnowledgeContexts({
      ...input,
      sessionId: "local-session",
    }, getContextStoreOptions());

    return mergeAgentKnowledgeContextLists(primary, fallback);
  }

  const provider = {
    ...mockProvider,
    async getHomeDashboard() {
      return getHomeDashboardData(provider);
    },
    async getAgentChat() {
      const paths = await getConfiguredPaths(options);
      const agentChat = await getAgentChatData({
        rootDir: options.agentChatRootDir,
        sessionPath: paths.agentChatSessionPath,
        userDataDir: options.userDataDir,
      });
      const attachedContexts = options.userDataDir
        ? await listStoredAgentKnowledgeContexts({
            sessionId: agentChat.session?.sessionId,
          }, getContextStoreOptions())
        : { attachedKnowledgeContexts: [], total: 0 };
      const [llmProviderStatus, permissionRequests] = await Promise.all([
        provider.getLlmProviderStatus(),
        provider.listPermissionRequests(),
      ]);

      return {
        ...agentChat,
        attachedKnowledgeContexts: attachedContexts.attachedKnowledgeContexts,
        attachedKnowledgeContextCount: attachedContexts.total,
        llmProviderStatus,
        permissionSummary: permissionRequests[0] ?? null,
      };
    },
    async prepareAgentChatMessageDraft(input = {}) {
      return prepareMessageDraft(input);
    },
    async previewAgentChatContextPack(input = {}) {
      return previewContextPack(input, {
        maxItems: options.agentChatContextPackMaxItems,
        provider,
      });
    },
    async previewAgentChatToolPlan(input = {}) {
      return previewToolPlan(input, {
        provider,
      });
    },
    async runAgentChatDryMessage(input = {}) {
      return runDryMessage(input, {
        executeTool: options.toolExecutor,
        llmClient: options.llmClient,
        maxItems: options.agentChatContextPackMaxItems,
        provider,
      });
    },
    async sendAgentChatMessage(input = {}) {
      const draft = await prepareMessageDraft(input);
      const contextPack = await previewContextPack(draft, {
        maxItems: options.agentChatContextPackMaxItems,
        provider,
      });
      const agentChatForToolPlan = await provider.getAgentChat().catch(() => ({}));
      const toolLoop = await runAgentToolLoop({
        contextPack,
        draft,
        dryRunToolPlan: input.dryRunToolPlan,
        llmText: input.llmToolPlanText,
        provider,
        session: agentChatForToolPlan,
        toolPlan: input.toolPlan,
        toolPolicy: getToolPolicy(input),
      });

      if (!toolLoop.shouldCallLlm) {
        return buildToolGateAgentChatResult({
          contextPack: toolLoop.contextPack,
          draft,
          status: toolLoop.status,
          toolLoop,
        });
      }

      const llmContext = await buildAgentChatLlmContextPayload({
        contextPack: toolLoop.contextPack,
        draft,
        toolResultsSummary: toolLoop.toolResultsSummary,
      });
      const llmContextPack = filterAgentChatLlmContextPack(toolLoop.contextPack);
      const llmResult = await provider.sendLlmTextMessage({
        ...draft,
        contextPack: llmContextPack,
        contextSummary: llmContext.contextSummary,
        messages: llmContext.messages,
        toolResultsSummary: toolLoop.toolResultsSummary,
        userText: draft.userText,
      });

      if (isApiResult(llmResult) && !llmResult.ok) {
        if (toolLoop.toolResultsSummary?.length > 0) {
          const result = buildToolLlmErrorResult({
            contextPack: toolLoop.contextPack,
            contextSummary: llmContext.contextSummary,
            draft,
            llmResult,
            toolLoop,
          });

          if (options.userDataDir && result.assistantMessage.text) {
            await appendAgentChatSessionTurn(
              {
                assistantMessage: result.assistantMessage,
                createdAt: draft.createdAt,
                contextSummary: result.contextSummary,
                providerMetadata: result.llm?.metadata ?? result.assistantMessage.metadata,
                toolCalls: result.toolCalls,
                toolDecisions: result.toolDecisions,
                toolPlan: result.toolPlan,
                toolResultsSummary: result.toolResultsSummary,
                userMessage: result.userMessage,
              },
              { userDataDir: options.userDataDir },
            );
          }

          return result;
        }
        return llmResult;
      }

      const llmData = isApiResult(llmResult) ? llmResult.data : llmResult;
      const result = buildAgentChatLlmResult({
        contextPack: toolLoop.contextPack,
        contextSummary: llmContext.contextSummary,
        draft,
        llmData,
        toolLoop,
      });

      if (options.userDataDir && result.assistantMessage.text) {
        await appendAgentChatSessionTurn(
          {
            assistantMessage: result.assistantMessage,
            createdAt: draft.createdAt,
            contextSummary: result.contextSummary,
            providerMetadata: result.llm?.metadata ?? result.assistantMessage.metadata,
            toolCalls: result.toolCalls,
            toolDecisions: result.toolDecisions,
            toolPlan: result.toolPlan,
            toolResultsSummary: result.toolResultsSummary,
            userMessage: result.userMessage,
          },
          { userDataDir: options.userDataDir },
        );
      }

      return result;
    },
    async streamAgentChatMessage(input = {}, streamOptions = {}) {
      const requestId = input.requestId || `agent-chat-stream-${Date.now()}`;
      const abortController = new AbortController();
      activeAgentChatStreams.set(requestId, abortController);

      try {
        const agentChat = await provider.getAgentChat().catch(() => ({}));
        const agentConfig = await getAgentManagementData().then(
          (d) => (Array.isArray(d?.agents) ? d.agents : []).find((a) => a.id === input.agentId) ?? null,
        ).catch(() => null);
        const knowledgeContexts = await provider.getAgentChatKnowledgeContexts?.().catch(() => []) ?? [];

        const loopResult = await runAgentLoop(
          {
            abortSignal: abortController.signal,
            agentConfig,
            attachedKnowledgeContexts: Array.isArray(knowledgeContexts?.attachedKnowledgeContexts)
              ? knowledgeContexts.attachedKnowledgeContexts
              : [],
            llmClient: (llmInput, llmOpts) => provider.streamLlmTextMessage(llmInput, {
              abortSignal: abortController.signal,
              ...llmOpts,
            }),
            provider,
            requestId,
            session: agentChat,
            toolPolicy: getToolPolicy(input),
            userText: input.userText,
          },
          {
            onToken: (token, event) => {
              streamOptions.onEvent?.({
                metadata: event?.metadata,
                requestId,
                status: "generating",
                text: event?.text ?? token,
                token,
                type: "token",
              });
            },
            onToolCall: (info) => {
              streamOptions.onEvent?.({
                requestId,
                toolCall: info,
                type: "tool_call",
              });
            },
            onRoundStart: (round) => {
              streamOptions.onEvent?.({
                requestId,
                round,
                type: "round",
              });
            },
          },
        );

        const userMessage = {
          id: `user-${requestId}`,
          role: "user",
          text: redactAgentToolText(input.userText),
        };
        const rawMetadata = loopResult.metadata;
        const safeMetadata = rawMetadata ? {
          completionId: rawMetadata.completionId,
          finishReason: rawMetadata.finishReason,
          model: rawMetadata.model,
          provider: rawMetadata.provider,
          toolCalls: rawMetadata.toolCalls,
        } : null;

        const assistantMessage = {
          id: `assistant-${requestId}`,
          metadata: safeMetadata,
          role: "assistant",
          source: "llm",
          status: loopResult.status === "cancelled" ? "cancelled" : loopResult.status === "error" ? "error" : "ready",
          text: loopResult.content,
        };
        const toolCalls = (loopResult.toolCallHistory || []).map((tc) => ({
          duration: tc.round ? `round ${tc.round}` : "n/a",
          meta: tc.summary || tc.label || "",
          permission: tc.permission || `Level ${tc.permissionLevel ?? 1}`,
          state: tc.state,
          status: tc.status,
          title: tc.label || tc.toolId,
          toolId: tc.toolId,
        }));

        const result = {
          assistantMessage,
          contextSummary: loopResult.contextSummary,
          requestId,
          status: loopResult.status === "approval_required" ? "approval_required" : loopResult.status || "ready",
          toolCallHistory: loopResult.toolCallHistory,
          toolCalls,
          toolDecisions: loopResult.toolDecisions,
          toolResultsSummary: loopResult.toolResultsSummary,
          userMessage,
        };

        if (options.userDataDir && assistantMessage.status !== "cancelled" && assistantMessage.text) {
          await appendAgentChatSessionTurn(
            {
              assistantMessage,
              contextSummary: result.contextSummary,
              toolCalls: result.toolCalls,
              toolDecisions: result.toolDecisions,
              toolResultsSummary: result.toolResultsSummary,
              userMessage,
            },
            { userDataDir: options.userDataDir },
          );
        }

        if (assistantMessage.status !== "cancelled" && assistantMessage.status !== "error") {
          streamOptions.onEvent?.({
            metadata: loopResult.metadata,
            requestId,
            status: "done",
            text: assistantMessage.text,
            type: "done",
          });
        } else {
          streamOptions.onEvent?.({
            requestId,
            status: assistantMessage.status,
            text: assistantMessage.text,
            type: assistantMessage.status,
          });
        }

        return result;
      } finally {
        activeAgentChatStreams.delete(requestId);
      }
    },
    async cancelAgentChatStream(input = {}) {
      const requestId = input.requestId;
      const abortController = activeAgentChatStreams.get(requestId);

      if (abortController) {
        abortController.abort();
      }

      return {
        requestId,
        status: "cancelled",
      };
    },
    async resetAgentChatSession(input = {}) {
      const sessionId = await resolveAgentKnowledgeContextSessionId(input);
      if (!options.userDataDir) {
        return {
          ...mockProvider.getMockAgentChatData(),
          attachedKnowledgeContexts: [],
          chatMessages: [],
          contextItems: [],
          status: "unavailable",
          toolCalls: [],
        };
      }

      const resetResult = await resetAgentChatUserDataSession({ userDataDir: options.userDataDir });
      const sessionIdsToClear = new Set([sessionId, "agent-chat-session", "local-session"]);
      for (const id of sessionIdsToClear) {
        await clearStoredAgentKnowledgeContexts({
          ...input,
          sessionId: id,
        }, getContextStoreOptions());
      }

      const agentChat = await provider.getAgentChat();
      return {
        ...agentChat,
        attachedKnowledgeContexts: [],
        attachedKnowledgeContextCount: 0,
        chatMessages: [],
        contextItems: [],
        recentSessions: resetResult.history ?? agentChat.recentSessions ?? [],
        status: "reset",
        toolCalls: [],
      };
    },
    async restoreAgentChatSession(input = {}) {
      if (!options.userDataDir) {
        return {
          status: "unavailable",
        };
      }

      const restored = await restoreAgentChatUserDataSession(input, { userDataDir: options.userDataDir });
      if (restored.status !== "restored") {
        return restored;
      }

      return {
        ...(await provider.getAgentChat()),
        status: "restored",
      };
    },
    async listAgentChatKnowledgeContexts(input = {}) {
      const sessionId = await resolveAgentKnowledgeContextSessionId(input);
      if (!options.userDataDir) {
        return {
          attachedKnowledgeContexts: [],
          sessionId,
          status: "unavailable",
          total: 0,
        };
      }

      return listResolvedAgentKnowledgeContexts(input);
    },
    async attachKnowledgeContextToAgentChat(input = {}) {
      const sessionId = await resolveAgentKnowledgeContextSessionId(input);
      if (!options.userDataDir) {
        return {
          attachedKnowledgeContexts: [],
          sessionId,
          status: "unavailable",
          total: 0,
        };
      }

      const { sourceHealth } = await getKnowledgeSourceContext();
      if (!canReadLocalSource(sourceHealth)) {
        return {
          attachedKnowledgeContexts: [],
          sessionId,
          status: sourceHealth.configured ? "unavailable" : "unconfigured",
          total: 0,
        };
      }

      const index = await readKnowledgeIndex({ userDataDir: options.userDataDir });
      const attachment = findKnowledgeAttachment(index, input) ?? buildFallbackKnowledgeAttachment(input);
      if (!attachment) {
        return {
          ...(await listStoredAgentKnowledgeContexts({
            ...input,
            sessionId,
          }, getContextStoreOptions())),
          status: "not_found",
        };
      }

      return addStoredAgentKnowledgeContext({
        ...attachment,
        sessionId,
      }, getContextStoreOptions());
    },
    async removeKnowledgeContextFromAgentChat(input = {}) {
      const sessionId = await resolveAgentKnowledgeContextSessionId(input);
      if (!options.userDataDir) {
        return {
          attachedKnowledgeContexts: [],
          sessionId,
          status: "unavailable",
          total: 0,
        };
      }

      await removeStoredAgentKnowledgeContext({
        ...input,
        sessionId,
      }, getContextStoreOptions());
      if (sessionId !== "local-session") {
        await removeStoredAgentKnowledgeContext({
          ...input,
          sessionId: "local-session",
        }, getContextStoreOptions());
      }

      return {
        ...(await listResolvedAgentKnowledgeContexts({
          ...input,
          sessionId,
        })),
        status: "removed",
      };
    },
    async clearAgentChatKnowledgeContexts(input = {}) {
      const sessionId = await resolveAgentKnowledgeContextSessionId(input);
      if (!options.userDataDir) {
        return {
          attachedKnowledgeContexts: [],
          sessionId,
          status: "unavailable",
          total: 0,
        };
      }

      await clearStoredAgentKnowledgeContexts({
        ...input,
        sessionId,
      }, getContextStoreOptions());
      if (sessionId !== "local-session") {
        await clearStoredAgentKnowledgeContexts({
          ...input,
          sessionId: "local-session",
        }, getContextStoreOptions());
      }

      return {
        attachedKnowledgeContexts: [],
        sessionId,
        status: "cleared",
        total: 0,
      };
    },
    async getCodeRepository() {
      const { paths, sourceHealth } = await getCodeRepositorySourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return attachSourceStatus(
          mockProvider.getMockCodeRepositoryData(),
          PHASE2_SOURCE_META.codeRepository,
          sourceHealth,
          !sourceHealth.configured,
        );
      }

      return attachSourceStatus(
        await getCodeRepositoryData({
          gitStatusReader: options.gitStatusReader,
          rootDir: paths.codeRepositoryRootDir,
        }),
        PHASE2_SOURCE_META.codeRepository,
        sourceHealth,
        false,
      );
    },
    async getKnowledgeBase() {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return attachSourceStatus(
          mockProvider.getMockKnowledgeBaseData(),
          PHASE2_SOURCE_META.knowledge,
          sourceHealth,
          !sourceHealth.configured,
        );
      }

      return attachSourceStatus(
        await getKnowledgeBaseData({
          rootDir: paths.knowledgeBaseRootDir,
          userDataDir: options.userDataDir,
        }),
        PHASE2_SOURCE_META.knowledge,
        sourceHealth,
        false,
      );
    },
    async getAgentManagement() {
      const paths = await getConfiguredPaths(options);
      const [agentManagement, llmProviders, permissionRequests] = await Promise.all([
        getAgentManagementData({
          configPath: paths.agentManagementConfigPath,
          rootDir: options.agentManagementRootDir,
        }),
        provider.listLlmProviders(),
        provider.listPermissionRequests(),
      ]);

      return {
        ...agentManagement,
        llmProviders,
        permissionRequests,
      };
    },
    async getLocalMusic() {
      const paths = await getConfiguredPaths(options);
      const settings = await provider.getSettings();
      const sourceHealth = findSourceHealth(settings, PHASE2_SOURCE_META.music);

      if (!canReadLocalSource(sourceHealth)) {
        return attachSourceStatus(
          mockProvider.getMockLocalMusicData(),
          PHASE2_SOURCE_META.music,
          sourceHealth,
          !sourceHealth.configured,
        );
      }

      return attachSourceStatus(
        await getLocalMusicData({ rootDir: paths.localMusicRootDir }),
        PHASE2_SOURCE_META.music,
        sourceHealth,
        false,
      );
    },
    async getIntelCenter() {
      const paths = await getConfiguredPaths(options);
      const settings = await provider.getSettings();
      const sourceHealth = findSourceHealth(settings, PHASE2_SOURCE_META.intel);

      if (!canReadLocalSource(sourceHealth)) {
        return attachSourceStatus(
          mockProvider.getMockIntelCenterData(),
          PHASE2_SOURCE_META.intel,
          sourceHealth,
          !sourceHealth.configured,
        );
      }

      return attachSourceStatus(
        await getLocalIntelCenterData({ rootDir: paths.localIntelRootDir }),
        PHASE2_SOURCE_META.intel,
        sourceHealth,
        false,
      );
    },
    async getSettings() {
      const paths = await getConfiguredPaths(options);
      const [settings, llmProviders, llmModels, secrets] = await Promise.all([
        getLocalSourcesData({
          agentChatSessionPath: paths.agentChatSessionPath,
          agentManagementConfigPath: paths.agentManagementConfigPath,
          codeRepositoryRootDir: paths.codeRepositoryRootDir,
          knowledgeBaseRootDir: paths.knowledgeBaseRootDir,
          localIntelRootDir: paths.localIntelRootDir,
          localMusicRootDir: paths.localMusicRootDir,
          widgetsDiskRoot: paths.widgetsDiskRoot,
        }),
        provider.listLlmProviders(),
        provider.listLlmModels(),
        options.llmProviders
          ? listLlmSecretStatuses({ providers: options.llmProviders })
          : getLlmPublicConfig().then((config) => [config.secret]),
      ]);

      return {
        ...settings,
        llmModels,
        llmProviders,
        secrets,
      };
    },
    async getAppStatus() {
      const settings = await provider.getSettings();

      return {
        status: "ready",
        provider: "local",
        settingsReady: settings.summary.ready,
        settingsTotal: settings.summary.total,
      };
    },
    async getSettingsSummary() {
      return (await provider.getSettings()).summary;
    },
    async listTasks() {
      const dashboard = await provider.getHomeDashboard();

      return dashboard.homeTasks.map((task, index) => ({
        taskId: `local-task-${index + 1}`,
        title: task.title,
        module: task.module,
        state: "ready",
        updatedAt: task.time,
      }));
    },
    async listKnowledgeSources() {
      const [settings, knowledgeBase] = await Promise.all([
        provider.getSettings(),
        provider.getKnowledgeBase(),
      ]);
      const source = settings.sources.find((item) => item.id === "knowledge-base");

      return [
        {
          ...knowledgeBase.knowledgeSources?.[0],
          sourceId: "knowledge-base",
          title: source?.label ?? "Docs root",
          type: "directory",
          status: source?.state ?? "missing",
          documentCount: knowledgeBase.indexStats.docs,
          chunkCount: knowledgeBase.indexStats.chunks,
        },
      ];
    },
    async listKnowledgeDocuments() {
      return (await provider.getKnowledgeBase()).knowledgeDocuments;
    },
    async listKnowledgeFileTree() {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.listKnowledgeFileTree();
      }

      return getKnowledgeFileTree({
        rootDir: paths.knowledgeBaseRootDir,
      });
    },
    async getKnowledgeIndexStatus() {
      return (await provider.getKnowledgeBase()).indexStats;
    },
    async searchKnowledgeLocal(query) {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.searchKnowledgeLocal(query);
      }

      return searchKnowledgeLocal({
        ...getKnowledgeEmbeddingOptions(),
        query,
        rootDir: paths.knowledgeBaseRootDir,
        userDataDir: options.userDataDir,
      });
    },
    async startKnowledgeIndex() {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return {
          message: sourceHealth.message,
          source: "knowledge-index",
          status: sourceHealth.configured ? "unavailable" : "unconfigured",
          summary: {
            chunks: 0,
            docs: 0,
            failed: 0,
            indexed: 0,
            scanned: 0,
            skipped: 0,
          },
        };
      }

      const result = await reindexKnowledgeBase({
        ...getKnowledgeEmbeddingOptions(),
        rootDir: paths.knowledgeBaseRootDir,
        userDataDir: options.userDataDir,
      });

      return {
        ...(result.embeddingSummary ? { embeddingSummary: result.embeddingSummary } : {}),
        source: result.source,
        status: result.status,
        summary: result.summary,
        updatedAt: result.updatedAt,
      };
    },
    async getKnowledgeDocumentPreview(documentInput) {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.getKnowledgeDocumentPreview(documentInput);
      }

      const input = typeof documentInput === "string" ? { id: documentInput } : (documentInput ?? {});

      return getKnowledgeDocumentPreviewData({
        ...input,
        id: input.id ?? input.documentId,
        rootDir: paths.knowledgeBaseRootDir,
        userDataDir: options.userDataDir,
      });
    },
    async getKnowledgeDocumentImage(imageInput = {}) {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();
      if (!canReadLocalSource(sourceHealth)) {
        return { dataUrl: null, status: "unavailable" };
      }

      const rootDir = paths.knowledgeBaseRootDir;
      const relativePath = typeof (imageInput.relativePath ?? imageInput.path) === "string"
        ? (imageInput.relativePath ?? imageInput.path).trim()
        : "";
      if (!relativePath || relativePath.includes("..")) {
        return { dataUrl: null, status: "invalid_path" };
      }

      const absolutePath = path.resolve(rootDir, relativePath);
      if (!absolutePath.startsWith(path.resolve(rootDir))) {
        return { dataUrl: null, status: "invalid_path" };
      }

      try {
        const buffer = await fs.readFile(absolutePath);
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeMap = {
          ".gif": "image/gif",
          ".jpeg": "image/jpeg",
          ".jpg": "image/jpeg",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
        };
        const mime = mimeMap[ext] ?? "application/octet-stream";
        return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}`, status: "ok" };
      } catch {
        return { dataUrl: null, status: "not_found" };
      }
    },
    async listCodeRepositories() {
      const paths = await getConfiguredPaths(options);
      const codeRepository = await provider.getCodeRepository();
      const rootDir = paths.codeRepositoryRootDir ?? process.cwd();

      return [
        {
          repoId: "local-root",
          name: path.basename(rootDir),
          status: codeRepository.gitState.statusLabel,
          branch: codeRepository.gitState.branch,
          changed: codeRepository.gitState.changed,
        },
      ];
    },
    async getCodeGitSummary() {
      return (await provider.getCodeRepository()).gitState;
    },
    async listCodeRepositoryFiles() {
      const { paths, sourceHealth } = await getCodeRepositorySourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.listCodeRepositoryFiles();
      }

      return getCodeRepositoryFiles({
        gitStatusReader: options.gitStatusReader,
        rootDir: paths.codeRepositoryRootDir,
      });
    },
    async getCodeRepositoryMetrics() {
      const { paths, sourceHealth } = await getCodeRepositorySourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.getCodeRepositoryMetrics();
      }

      return getCodeRepositoryMetrics({
        gitStatusReader: options.gitStatusReader,
        rootDir: paths.codeRepositoryRootDir,
      });
    },
    async getCodeRepositoryStructure() {
      const { paths, sourceHealth } = await getCodeRepositorySourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.getCodeRepositoryStructure();
      }

      return getCodeRepositoryStructure({
        gitStatusReader: options.gitStatusReader,
        rootDir: paths.codeRepositoryRootDir,
      });
    },
    async listAgents() {
      return (await provider.getAgentManagement()).agents;
    },
    async listAgentSessions() {
      const agentChat = await provider.getAgentChat();
      const session = agentChat.session ?? {};
      const sessionId = session.sessionId ?? session.id ?? "local-session";

      return [
        {
          activeAgentId: session.activeAgentId ?? "",
          lastUpdated: session.lastUpdated ?? null,
          messageCount: agentChat.chatMessages.length,
          sessionId,
          state: session.state ?? session.status ?? "ready",
          status: session.status ?? session.state ?? "ready",
          title: session.title ?? "Local session",
        },
        ...(Array.isArray(agentChat.recentSessions) ? agentChat.recentSessions.map((item) => ({
          lastUpdated: item.lastUpdated ?? null,
          messageCount: item.messageCount ?? 0,
          preview: item.preview ?? "",
          sessionId: item.sessionId,
          state: "archived",
          status: "archived",
          title: item.title ?? "Previous chat",
        })) : []),
      ];
    },
    async listLlmProviders() {
      if (!options.llmProviders) {
        return [await getLlmPublicConfig().then((config) => config.provider)];
      }

      return listLlmProviders({ providers: options.llmProviders });
    },
    async listLlmModels() {
      if (!options.llmProviders) {
        return [await getLlmPublicConfig().then((config) => config.model)];
      }

      return listLlmModels({ providers: options.llmProviders });
    },
    async getLlmProviderStatus() {
      if (!options.llmProviders) {
        return getLlmPublicConfig().then((config) => config.provider);
      }

      return getLlmProviderStatus({ providers: options.llmProviders });
    },
    async validateLlmProviderConfig(config) {
      return validateProviderConfig(config, { providers: options.llmProviders });
    },
    async sendLlmTextMessage(input = {}) {
      if (typeof options.llmClient === "function") {
        return options.llmClient(input);
      }

      return sendAdapterLlmTextMessage(input, {
        envPath: options.llmEnvPath,
        processEnv: options.processEnv,
        transport: options.llmTransport,
      });
    },
    async streamLlmTextMessage(input = {}, streamOptions = {}) {
      if (typeof options.llmStreamClient === "function") {
        return options.llmStreamClient(input, streamOptions);
      }

      return streamAdapterLlmTextMessage(input, {
        abortSignal: streamOptions.abortSignal,
        envPath: options.llmEnvPath,
        onEvent: streamOptions.onEvent,
        processEnv: options.processEnv,
        transport: options.llmTransport,
      });
    },
    async listPermissionRequests() {
      return listPermissionRequests({ requests: options.permissionRequests });
    },
    async evaluateToolRequest(request) {
      return evaluateToolRequest(request);
    },
    async decidePermissionRequest(request) {
      return decidePermissionRequest(request);
    },
    async dryRunTool(request) {
      return dryRunTool(request);
    },
    async executeTool(request) {
      return executeTool(request);
    },
    async getIntelServiceStatus() {
      const paths = await getConfiguredPaths(options);
      return getLocalIntelServiceStatus({ rootDir: paths.localIntelRootDir });
    },
    async getIntelDashboardSummary() {
      const paths = await getConfiguredPaths(options);
      return getLocalIntelDashboardSummary({ rootDir: paths.localIntelRootDir });
    },
    async getIntelSourceHealth() {
      const paths = await getConfiguredPaths(options);
      return getLocalIntelSourceHealth({ rootDir: paths.localIntelRootDir });
    },
    async listIntelReports() {
      const paths = await getConfiguredPaths(options);
      return listLocalIntelReports({ rootDir: paths.localIntelRootDir });
    },
    async listIntelLogs() {
      const paths = await getConfiguredPaths(options);
      return listLocalIntelLogs({ rootDir: paths.localIntelRootDir });
    },
    async getMusicPlaybackState() {
      const localMusic = await provider.getLocalMusic();

      return {
        state: localMusic.tracks.length > 0 ? "idle" : "empty",
        currentTrack: localMusic.tracks[0] ?? null,
        trackCount: localMusic.tracks.length,
      };
    },
    async selectLocalSourcePath(sourceId) {
      const result = await selectLocalSourcePath(sourceId, {
        ...configOptions,
        dialog: options.dialog,
      });

      return {
        ...result,
        settings: await provider.getSettings(),
      };
    },
    async saveLocalSourcePath(sourceId, selectedPath) {
      await saveLocalSourcePath(sourceId, selectedPath, configOptions);
      return provider.getSettings();
    },
    async getWidgets() {
      const paths = await getConfiguredPaths(options);
      return {
        ...mockProvider.getMockWidgetsData(),
        ...(await getWidgetsData({
          diskReader: options.diskReader,
          diskRoot: paths.widgetsDiskRoot,
          systemReader: options.systemReader,
        })),
      };
    },
  };

  return provider;
}

export const mainDataProvider = createMainDataProvider();
