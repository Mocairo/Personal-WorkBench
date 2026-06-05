import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentChat,
  getCodeRepositoryMetrics,
  getHomeDashboard,
  getIntelDashboardSummary,
  getIntelSourceHealth,
  getIntelServiceStatus,
  getKnowledgeDocumentPreview,
  getCodeRepositoryStructure,
  dryRunTool,
  evaluateToolRequest,
  getLlmProviderStatus,
  prepareAgentChatMessageDraft,
  previewAgentChatContextPack,
  previewAgentChatToolPlan,
  listLlmModels,
  listLlmProviders,
  listAgentSessions,
  listAgents,
  listIntelLogs,
  listIntelReports,
  listCodeRepositoryFiles,
  listKnowledgeDocuments,
  listPermissionRequests,
  providerName,
  runAgentChatDryMessage,
  searchKnowledgeLocal,
  startKnowledgeIndex,
  sendAgentChatMessage,
  streamAgentChatMessage,
  cancelAgentChatStream,
  attachKnowledgeContextToAgentChat,
  clearAgentChatKnowledgeContexts,
  listAgentChatKnowledgeContexts,
  removeKnowledgeContextFromAgentChat,
  sendLlmTextMessage,
  validateLlmProviderConfig,
} from "./localProvider";

describe("local provider", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("uses window.api first and unwraps ApiResult payloads", async () => {
    globalThis.window = {
      api: {
        agent: {
          listSessions: async () => ({ data: { sessions: [] }, ok: true }),
        },
        dashboard: {
          getHomeDashboard: async () => ({ data: { homeTasks: [], quickEntries: [] }, ok: true }),
        },
      },
    };

    expect(providerName).toBe("local");
    await expect(getHomeDashboard()).resolves.toEqual({ homeTasks: [], quickEntries: [] });
  });

  it("keeps compatibility with unwrapped window.desktopApi page data", async () => {
    globalThis.window = {
      desktopApi: {
        agentChat: {
          getAgentChat: async () => ({ chatMessages: ["legacy"], contextItems: [], toolCalls: [] }),
        },
      },
    };

    await expect(getAgentChat()).resolves.toMatchObject({ chatMessages: ["legacy"] });
  });

  it("unwraps phase-3 Knowledge Base read APIs from window.api.kb", async () => {
    globalThis.window = {
      api: {
        kb: {
          getDocumentPreview: async (id) => ({
            data: { id, preview: "preview", relativePath: "README.md", source: "local" },
            ok: true,
          }),
          listDocuments: async () => ({
            data: [{ id: "doc-readme", relativePath: "README.md", source: "local" }],
            ok: true,
          }),
          searchLocal: async (query) => ({
            data: { query, results: [{ id: "doc-readme", relativePath: "README.md" }], source: "local" },
            ok: true,
          }),
          startIndex: async () => ({
            data: { source: "knowledge-index", status: "ready", summary: { docs: 1 } },
            ok: true,
          }),
        },
      },
    };

    await expect(listKnowledgeDocuments()).resolves.toEqual([
      { id: "doc-readme", relativePath: "README.md", source: "local" },
    ]);
    await expect(searchKnowledgeLocal("readme")).resolves.toMatchObject({
      query: "readme",
      results: [{ id: "doc-readme", relativePath: "README.md" }],
    });
    await expect(getKnowledgeDocumentPreview("doc-readme")).resolves.toMatchObject({
      id: "doc-readme",
      preview: "preview",
      relativePath: "README.md",
    });
    await expect(startKnowledgeIndex()).resolves.toMatchObject({
      source: "knowledge-index",
      status: "ready",
      summary: { docs: 1 },
    });
  });

  it("unwraps phase-4 Code Repository read APIs from window.api.codeRepo", async () => {
    globalThis.window = {
      api: {
        codeRepo: {
          getMetrics: async () => ({ data: { fileCount: 1, modules: 1 }, ok: true }),
          getStructure: async () => ({ data: [{ id: "dir-src", label: "src" }], ok: true }),
          listFiles: async () => ({
            data: [{ id: "repo-src-app-jsx", relativePath: "src/App.jsx", source: "local" }],
            ok: true,
          }),
        },
      },
    };

    await expect(listCodeRepositoryFiles()).resolves.toEqual([
      { id: "repo-src-app-jsx", relativePath: "src/App.jsx", source: "local" },
    ]);
    await expect(getCodeRepositoryMetrics()).resolves.toMatchObject({ fileCount: 1, modules: 1 });
    await expect(getCodeRepositoryStructure()).resolves.toEqual([{ id: "dir-src", label: "src" }]);
  });

  it("unwraps phase-5 local-intel read APIs from window.api.intel", async () => {
    globalThis.window = {
      api: {
        intel: {
          getDashboardSummary: async () => ({ data: { reportCount: 2, state: "ready" }, ok: true }),
          getServiceStatus: async () => ({ data: { serviceId: "local-intel", status: "stale" }, ok: true }),
          getSourceHealth: async () => ({ data: [{ label: "reports", status: "ready" }], ok: true }),
          listLogs: async () => ({ data: [{ level: "info", message: "fetch completed" }], ok: true }),
          listReports: async () => ({ data: [{ reportId: "daily", relativePath: "reports/daily.md" }], ok: true }),
        },
      },
    };

    await expect(getIntelServiceStatus()).resolves.toMatchObject({ serviceId: "local-intel", status: "stale" });
    await expect(getIntelDashboardSummary()).resolves.toMatchObject({ reportCount: 2, state: "ready" });
    await expect(getIntelSourceHealth()).resolves.toEqual([{ label: "reports", status: "ready" }]);
    await expect(listIntelReports()).resolves.toEqual([{ reportId: "daily", relativePath: "reports/daily.md" }]);
    await expect(listIntelLogs()).resolves.toEqual([{ level: "info", message: "fetch completed" }]);
  });

  it("unwraps phase-6 Agent read APIs from window.api.agent", async () => {
    globalThis.window = {
      api: {
        agent: {
          listAgents: async () => ({
            data: [{ name: "Repo Analyst", state: "online", tools: "git, parser" }],
            ok: true,
          }),
          listSessions: async () => ({
            data: [{ messageCount: 3, sessionId: "session-local", status: "ready" }],
            ok: true,
          }),
        },
      },
    };

    await expect(listAgents()).resolves.toEqual([
      { name: "Repo Analyst", state: "online", tools: "git, parser" },
    ]);
    await expect(listAgentSessions()).resolves.toEqual([
      { messageCount: 3, sessionId: "session-local", status: "ready" },
    ]);
  });

  it("unwraps phase-7 LLM, permission and tool skeleton APIs", async () => {
    globalThis.window = {
      api: {
        llm: {
          getProviderStatus: async () => ({ data: { provider: "openai", status: "ready" }, ok: true }),
          listModels: async () => ({ data: [{ model: "gpt-4.1-mini", status: "ready" }], ok: true }),
          listProviders: async () => ({ data: [{ provider: "openai", status: "ready" }], ok: true }),
          sendTextMessage: async (input) => ({
            data: {
              metadata: { toolCalls: 0 },
              role: "assistant",
              text: `Reply to ${input.userText}`,
            },
            ok: true,
          }),
          validateProviderConfig: async (config) => ({ data: { dryRun: true, provider: config.provider }, ok: true }),
        },
        permission: {
          evaluateToolRequest: async (request) => ({ data: { ...request, decision: "allow" }, ok: true }),
          listRequests: async () => ({ data: [{ requestId: "req-1", status: "pending" }], ok: true }),
        },
        tool: {
          dryRun: async (request) => ({ data: { ...request, wouldExecute: false }, ok: true }),
        },
      },
    };

    await expect(listLlmProviders()).resolves.toEqual([{ provider: "openai", status: "ready" }]);
    await expect(listLlmModels()).resolves.toEqual([{ model: "gpt-4.1-mini", status: "ready" }]);
    await expect(getLlmProviderStatus()).resolves.toEqual({ provider: "openai", status: "ready" });
    await expect(validateLlmProviderConfig({ provider: "openai" })).resolves.toEqual({
      dryRun: true,
      provider: "openai",
    });
    await expect(sendLlmTextMessage({ userText: "Hello" })).resolves.toMatchObject({
      metadata: { toolCalls: 0 },
      role: "assistant",
      text: "Reply to Hello",
    });
    await expect(listPermissionRequests()).resolves.toEqual([{ requestId: "req-1", status: "pending" }]);
    await expect(evaluateToolRequest({ toolId: "kb.search" })).resolves.toMatchObject({
      decision: "allow",
      toolId: "kb.search",
    });
    await expect(dryRunTool({ toolId: "kb.search" })).resolves.toMatchObject({
      toolId: "kb.search",
      wouldExecute: false,
    });
  });

  it("unwraps phase-8 Agent Chat dry-run APIs from window.api.agentChat", async () => {
    globalThis.window = {
      api: {
        agentChat: {
          prepareMessageDraft: async (input) => ({ data: { draftId: "draft-1", userText: input.userText }, ok: true }),
          previewContextPack: async (input) => ({ data: { items: [{ title: "Docs" }], sessionId: input.sessionId }, ok: true }),
          previewToolPlan: async (input) => ({ data: { items: [{ toolId: "kb.search" }], sessionId: input.sessionId }, ok: true }),
          runDryMessage: async (input) => ({
            data: {
              dryRun: true,
              mockResponse: { text: "Dry response" },
              sessionId: input.sessionId,
            },
            ok: true,
          }),
          sendMessage: async (input) => ({
            data: {
              assistantMessage: { role: "assistant", text: `Live reply: ${input.userText}` },
              contextPack: { items: [{ title: "Docs" }] },
              status: "ready",
              toolCalls: [],
              userMessage: { role: "user", text: input.userText },
            },
            ok: true,
          }),
          streamMessage: async (input) => ({
            data: {
              assistantMessage: { role: "assistant", text: `Stream reply: ${input.userText}` },
              requestId: input.requestId,
              status: "ready",
              toolCalls: [],
              userMessage: { role: "user", text: input.userText },
            },
            ok: true,
          }),
          cancelStream: async (input) => ({
            data: { requestId: input.requestId, status: "cancelled" },
            ok: true,
          }),
          attachKnowledgeContext: async (input) => ({
            data: {
              attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: input.title }],
              sessionId: input.sessionId,
              status: "saved",
            },
            ok: true,
          }),
          clearKnowledgeContexts: async (input) => ({
            data: { attachedKnowledgeContexts: [], sessionId: input.sessionId, status: "cleared" },
            ok: true,
          }),
          listKnowledgeContexts: async (input) => ({
            data: {
              attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
              sessionId: input.sessionId,
              total: 1,
            },
            ok: true,
          }),
          removeKnowledgeContext: async (input) => ({
            data: { attachedKnowledgeContexts: [], sessionId: input.sessionId, status: "removed" },
            ok: true,
          }),
          onStreamEvent: (requestId, callback) => {
            callback({ requestId, text: "Stream", token: "Stream", type: "token" });
            return () => {
              globalThis.window.cleanedUp = true;
            };
          },
        },
      },
    };

    await expect(prepareAgentChatMessageDraft({ sessionId: "session-1", userText: "Hello" })).resolves.toEqual({
      draftId: "draft-1",
      userText: "Hello",
    });
    await expect(previewAgentChatContextPack({ sessionId: "session-1" })).resolves.toMatchObject({
      items: [{ title: "Docs" }],
      sessionId: "session-1",
    });
    await expect(previewAgentChatToolPlan({ sessionId: "session-1" })).resolves.toMatchObject({
      items: [{ toolId: "kb.search" }],
      sessionId: "session-1",
    });
    await expect(runAgentChatDryMessage({ sessionId: "session-1", userText: "Hello" })).resolves.toMatchObject({
      dryRun: true,
      mockResponse: { text: "Dry response" },
      sessionId: "session-1",
    });
    await expect(sendAgentChatMessage({ sessionId: "session-1", userText: "Hello" })).resolves.toMatchObject({
      assistantMessage: { role: "assistant", text: "Live reply: Hello" },
      status: "ready",
      toolCalls: [],
      userMessage: { role: "user", text: "Hello" },
    });
    const events = [];
    await expect(streamAgentChatMessage(
      { requestId: "request-1", sessionId: "session-1", userText: "Hello" },
      { onEvent: (event) => events.push(event) },
    )).resolves.toMatchObject({
      assistantMessage: { role: "assistant", text: "Stream reply: Hello" },
      requestId: "request-1",
      status: "ready",
    });
    expect(events).toEqual([
      { requestId: "request-1", text: "Stream", token: "Stream", type: "token" },
    ]);
    expect(globalThis.window.cleanedUp).toBe(true);
    await expect(cancelAgentChatStream({ requestId: "request-1" })).resolves.toEqual({
      requestId: "request-1",
      status: "cancelled",
    });
    await expect(attachKnowledgeContextToAgentChat({
      documentId: "doc-1",
      sessionId: "session-1",
      title: "Docs",
    })).resolves.toMatchObject({
      attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
      status: "saved",
    });
    await expect(listAgentChatKnowledgeContexts({ sessionId: "session-1" })).resolves.toMatchObject({
      attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
      total: 1,
    });
    await expect(removeKnowledgeContextFromAgentChat({
      contextId: "doc-1:chunk-1",
      sessionId: "session-1",
    })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      status: "removed",
    });
    await expect(clearAgentChatKnowledgeContexts({ sessionId: "session-1" })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      status: "cleared",
    });
  });
});
