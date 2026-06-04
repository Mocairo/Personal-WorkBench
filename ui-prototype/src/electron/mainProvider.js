import path from "node:path";
import * as mockProvider from "../services/mockProvider.js";
import { redactSecretText } from "../shared/llmSecurityContracts.js";
import { buildProviderStatus, buildSourceHealth } from "../shared/sourceStatus.js";
import { getAgentChatData } from "./agentChatAdapter.js";
import {
  prepareMessageDraft,
  previewContextPack,
  previewToolPlan,
  runDryMessage,
} from "./agentDryRunAdapter.js";
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
  getKnowledgeDocumentPreview,
  searchKnowledgeLocal,
} from "./knowledgeBaseAdapter.js";
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
import { appendAgentChatSessionTurn } from "./agentChatSessionStore.js";
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

function getToolPolicy(input = {}) {
  return {
    approveAllLevel1: Boolean(input.approveAllLevel1),
    approvedToolCallIds: Array.isArray(input.approvedToolCallIds) ? input.approvedToolCallIds : [],
    approvedToolIds: Array.isArray(input.approvedToolIds) ? input.approvedToolIds : [],
    autoAllowLevel1ReadOnly: Boolean(input.autoAllowLevel1ReadOnly),
    ...(input.toolPolicy && typeof input.toolPolicy === "object" ? input.toolPolicy : {}),
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

function buildToolGateAgentChatResult({ contextPack, draft, requestId, status, toolLoop }) {
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

function buildToolLlmErrorResult({ contextPack, draft, llmResult, requestId, toolLoop }) {
  const error = isApiResult(llmResult) ? llmResult.error : llmResult?.error;
  const message = redactAgentToolText(error?.message || "LLM request failed after read-only tools completed.");

  return {
    assistantMessage: {
      id: `llm-error-${draft.id}`,
      role: "assistant",
      source: "llm",
      status: "error",
      text: `Tool results are available, but the final LLM summary failed. ${message}`,
    },
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

function buildAgentChatLlmResult({ contextPack, draft, llmData, requestId, toolLoop }) {
  const metadata = sanitizeLlmMetadata(llmData?.metadata);
  const status = llmData?.status === "cancelled" ? "cancelled" : "ready";
  const assistantText = redactAgentToolText(llmData?.text ?? "");
  const toolPayload = getToolLoopPayload(toolLoop);

  return {
    assistantMessage: {
      id: llmData?.id ?? `llm-agent-${draft.id}`,
      metadata,
      role: "assistant",
      source: "llm",
      status,
      text: assistantText,
    },
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
      const [llmProviderStatus, permissionRequests] = await Promise.all([
        provider.getLlmProviderStatus(),
        provider.listPermissionRequests(),
      ]);

      return {
        ...agentChat,
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
      const toolLoop = await runAgentToolLoop({
        contextPack,
        draft,
        dryRunToolPlan: input.dryRunToolPlan,
        llmText: input.llmToolPlanText,
        provider,
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

      const llmResult = await provider.sendLlmTextMessage({
        ...draft,
        contextPack: toolLoop.contextPack,
        toolResultsSummary: toolLoop.toolResultsSummary,
        userText: draft.userText,
      });

      if (isApiResult(llmResult) && !llmResult.ok) {
        if (toolLoop.toolResultsSummary?.length > 0) {
          const result = buildToolLlmErrorResult({
            contextPack: toolLoop.contextPack,
            draft,
            llmResult,
            toolLoop,
          });

          if (options.userDataDir && result.assistantMessage.text) {
            await appendAgentChatSessionTurn(
              {
                assistantMessage: result.assistantMessage,
                createdAt: draft.createdAt,
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
        draft,
        llmData,
        toolLoop,
      });

      if (options.userDataDir && result.assistantMessage.text) {
        await appendAgentChatSessionTurn(
          {
            assistantMessage: result.assistantMessage,
            createdAt: draft.createdAt,
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
        const draft = await prepareMessageDraft({
          ...input,
          requestId,
        });
        const contextPack = await previewContextPack(draft, {
          maxItems: options.agentChatContextPackMaxItems,
          provider,
        });
        const toolLoop = await runAgentToolLoop({
          contextPack,
          draft,
          dryRunToolPlan: input.dryRunToolPlan,
          llmText: input.llmToolPlanText,
          provider,
          toolPlan: input.toolPlan,
          toolPolicy: getToolPolicy(input),
        });

        if (!toolLoop.shouldCallLlm) {
          return buildToolGateAgentChatResult({
            contextPack: toolLoop.contextPack,
            draft,
            requestId,
            status: toolLoop.status,
            toolLoop,
          });
        }

        const llmResult = await provider.streamLlmTextMessage(
          {
            ...draft,
            contextPack: toolLoop.contextPack,
            requestId,
            toolResultsSummary: toolLoop.toolResultsSummary,
            userText: draft.userText,
          },
          {
            abortSignal: abortController.signal,
            onEvent: streamOptions.onEvent,
          },
        );

        if (isApiResult(llmResult) && !llmResult.ok) {
          if (toolLoop.toolResultsSummary?.length > 0) {
            return buildToolLlmErrorResult({
              contextPack: toolLoop.contextPack,
              draft,
              llmResult,
              requestId,
              toolLoop,
            });
          }
          return llmResult;
        }

        const llmData = isApiResult(llmResult) ? llmResult.data : llmResult;
        const result = buildAgentChatLlmResult({
          contextPack: toolLoop.contextPack,
          draft,
          llmData,
          requestId,
          toolLoop,
        });

        if (options.userDataDir && result.status !== "cancelled" && result.assistantMessage.text) {
          await appendAgentChatSessionTurn(
            {
              assistantMessage: result.assistantMessage,
              createdAt: draft.createdAt,
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
        await getKnowledgeBaseData({ rootDir: paths.knowledgeBaseRootDir }),
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
    async getKnowledgeIndexStatus() {
      return (await provider.getKnowledgeBase()).indexStats;
    },
    async searchKnowledgeLocal(query) {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.searchKnowledgeLocal(query);
      }

      return searchKnowledgeLocal({
        query,
        rootDir: paths.knowledgeBaseRootDir,
      });
    },
    async getKnowledgeDocumentPreview(documentId) {
      const { paths, sourceHealth } = await getKnowledgeSourceContext();

      if (!canReadLocalSource(sourceHealth)) {
        return mockProvider.getKnowledgeDocumentPreview(documentId);
      }

      return getKnowledgeDocumentPreview({
        id: documentId,
        rootDir: paths.knowledgeBaseRootDir,
      });
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
