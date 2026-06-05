import { describe, expect, it } from "vitest";
import { registerIpcHandlers, registerWindowControlHandlers } from "./ipcHandlers";

describe("electron IPC handlers", () => {
  it("registers every IPC method and wraps provider data in ApiResult", async () => {
    const handlers = new Map();
    const ipcMain = {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    };
    const provider = {
      getHomeDashboard: () => ({ page: "home" }),
      getAppStatus: () => ({ status: "ready" }),
      getAgentChat: () => ({ page: "chat" }),
      prepareAgentChatMessageDraft: (input) => ({ draftId: "draft-1", userText: input.userText }),
      previewAgentChatContextPack: () => ({ items: [{ title: "Docs" }], status: "ready" }),
      previewAgentChatToolPlan: () => ({ items: [{ toolId: "kb.search" }], status: "ready" }),
      runAgentChatDryMessage: (input) => ({ dryRun: true, userText: input.userText }),
      cancelAgentChatStream: (input) => ({ requestId: input.requestId, status: "cancelled" }),
      attachKnowledgeContextToAgentChat: (input) => ({
        attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: input.title }],
        sessionId: input.sessionId,
        status: "saved",
      }),
      clearAgentChatKnowledgeContexts: (input) => ({ attachedKnowledgeContexts: [], sessionId: input.sessionId, status: "cleared" }),
      listAgentChatKnowledgeContexts: (input) => ({
        attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
        sessionId: input.sessionId,
        total: 1,
      }),
      removeKnowledgeContextFromAgentChat: (input) => ({ attachedKnowledgeContexts: [], sessionId: input.sessionId, status: "removed" }),
      sendAgentChatMessage: (input) => ({
        assistantMessage: { role: "assistant", text: `Reply: ${input.userText}` },
        toolCalls: [],
      }),
      streamAgentChatMessage: (input, options) => {
        options.onEvent({
          metadata: {
            apiKey: "sk-hidden",
            model: "gpt-4.1-mini",
            provider: "openai",
          },
          requestId: input.requestId,
          text: "Reply token=sk-hidden",
          token: "Reply token=sk-hidden",
          type: "token",
        });

        return {
          requestId: input.requestId,
          status: "done",
          text: "Reply token=[redacted]",
        };
      },
      getKnowledgeBase: () => ({ page: "knowledge" }),
      getKnowledgeDocumentPreview: (documentId) => ({ documentId, preview: "readme" }),
      listKnowledgeSources: () => [{ sourceId: "docs" }],
      listKnowledgeDocuments: () => [{ documentId: "readme" }],
      getKnowledgeIndexStatus: () => ({ docs: 1 }),
      searchKnowledgeLocal: (query) => ({ query, results: [] }),
      startKnowledgeIndex: () => ({ source: "knowledge-index", status: "ready", summary: { docs: 1 } }),
      getAgentManagement: () => ({ page: "agents" }),
      listAgents: () => [{ name: "Repo Analyst" }],
      listAgentSessions: () => [],
      getCodeRepository: () => ({ page: "code" }),
      listCodeRepositories: () => [{ repoId: "local-root" }],
      getCodeGitSummary: () => ({ branch: "main" }),
      listCodeRepositoryFiles: () => [{ relativePath: "src/App.jsx" }],
      getCodeRepositoryMetrics: () => ({ fileCount: 1 }),
      getCodeRepositoryStructure: () => [{ id: "src" }],
      getLocalMusic: () => ({ page: "music" }),
      getMusicPlaybackState: () => ({ state: "idle" }),
      getIntelCenter: () => ({ page: "intel" }),
      getIntelDashboardSummary: () => ({ reports: 2 }),
      getIntelServiceStatus: () => ({ status: "running" }),
      getIntelSourceHealth: () => [{ label: "database", state: "ready" }],
      listIntelLogs: () => [{ level: "info", message: "ok" }],
      listIntelReports: () => [{ reportId: "2026-05-31" }],
      listLlmProviders: () => [{ provider: "openai-compatible", status: "unconfigured" }],
      listLlmModels: () => [{ model: "not configured", status: "unconfigured" }],
      getLlmProviderStatus: () => ({ provider: "openai-compatible", status: "unconfigured" }),
      validateLlmProviderConfig: (config) => ({ dryRun: true, provider: config.provider }),
      sendLlmTextMessage: () => ({ role: "assistant", text: "LLM reply" }),
      listPermissionRequests: () => [{ requestId: "req-1", status: "pending" }],
      evaluateToolRequest: (request) => ({ ...request, decision: "allow" }),
      dryRunTool: (request) => ({ ...request, wouldExecute: false }),
      getSettings: () => ({ page: "settings" }),
      getSettingsSummary: () => ({ ready: 7, total: 7 }),
      listTasks: () => [],
      saveLocalSourcePath: (sourceId, selectedPath) => ({ selectedPath, sourceId }),
      selectLocalSourcePath: (sourceId) => ({ sourceId }),
      getWidgets: () => ({ page: "widgets" }),
    };

    registerIpcHandlers(ipcMain, provider);

    expect([...handlers.keys()]).toEqual([
      "dashboard:getHomeDashboard",
      "agentChat:getAgentChat",
      "agentChat:message:prepareDraft",
      "agentChat:context:preview",
      "agentChat:toolPlan:preview",
      "agentChat:message:runDry",
      "agentChat:message:send",
      "agentChat:message:stream",
      "agentChat:message:stream:cancel",
      "agentChat:knowledgeContext:attach",
      "agentChat:knowledgeContext:list",
      "agentChat:knowledgeContext:remove",
      "agentChat:knowledgeContext:clear",
      "knowledge:getKnowledgeBase",
      "agentManagement:getAgentManagement",
      "repository:getCodeRepository",
      "music:getLocalMusic",
      "intel:getIntelCenter",
      "settings:getSettings",
      "settings:selectLocalSourcePath",
      "settings:saveLocalSourcePath",
      "widgets:getWidgets",
      "system:app:status",
      "system:settings:summary",
      "system:task:list",
      "kb:source:list",
      "kb:document:list",
      "kb:index:status",
      "kb:search:local",
      "kb:document:preview",
      "kb:index:start",
      "codeRepo:repository:list",
      "codeRepo:git:summary",
      "codeRepo:file:list",
      "codeRepo:metrics:get",
      "codeRepo:structure:get",
      "codeRepo:repository:scan",
      "agent:agent:list",
      "agent:session:list",
      "agent:session:sendMessage",
      "llm:provider:list",
      "llm:model:list",
      "llm:provider:status",
      "llm:provider:validate",
      "llm:message:send",
      "llm:message:sendText",
      "permission:request:list",
      "permission:tool:evaluate",
      "permission:request:decide",
      "tool:dryRun",
      "tool:execute",
      "intel:service:status",
      "intel:dashboard:summary",
      "intel:source:health",
      "intel:report:list",
      "intel:log:list",
      "intel:service:start",
      "intel:service:stop",
      "intel:update:runNow",
      "music:playback:state",
      "music:playback:play",
      "voice:status:get",
      "voice:dictation:start",
    ]);
    await expect(handlers.get("dashboard:getHomeDashboard")()).resolves.toEqual({
      data: { page: "home" },
      ok: true,
    });
    await expect(handlers.get("system:app:status")()).resolves.toEqual({
      data: { status: "ready" },
      ok: true,
    });
    await expect(handlers.get("agentChat:message:prepareDraft")(null, { userText: "dry run" })).resolves.toEqual({
      data: { draftId: "draft-1", userText: "dry run" },
      ok: true,
    });
    await expect(handlers.get("agentChat:message:runDry")(null, { userText: "dry run" })).resolves.toEqual({
      data: { dryRun: true, userText: "dry run" },
      ok: true,
    });
    await expect(handlers.get("agentChat:message:send")(null, { userText: "hello" })).resolves.toEqual({
      data: {
        assistantMessage: { role: "assistant", text: "Reply: hello" },
        toolCalls: [],
      },
      ok: true,
    });
    await expect(
      handlers.get("agentChat:message:stream")(
        {
          sender: {
            send(channel, payload) {
              expect(channel).toBe("agentChat:message:stream:event");
              expect(payload).toEqual({
                metadata: {
                  model: "gpt-4.1-mini",
                  provider: "openai",
                },
                requestId: "request-1",
                status: "generating",
                text: "Reply [redacted]",
                token: "Reply [redacted]",
                type: "token",
              });
              expect(JSON.stringify(payload)).not.toMatch(/sk-hidden|apiKey|Authorization/);
            },
          },
        },
        { requestId: "request-1", userText: "hello" },
      ),
    ).resolves.toEqual({
      data: {
        requestId: "request-1",
        status: "done",
        text: "Reply token=[redacted]",
      },
      ok: true,
    });
    await expect(handlers.get("agentChat:message:stream:cancel")(null, { requestId: "request-1" })).resolves.toEqual({
      data: { requestId: "request-1", status: "cancelled" },
      ok: true,
    });
    await expect(handlers.get("agentChat:knowledgeContext:attach")(null, {
      documentId: "doc-1",
      sessionId: "session-1",
      title: "Docs",
    })).resolves.toEqual({
      data: {
        attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
        sessionId: "session-1",
        status: "saved",
      },
      ok: true,
    });
    await expect(handlers.get("agentChat:knowledgeContext:list")(null, { sessionId: "session-1" })).resolves.toEqual({
      data: {
        attachedKnowledgeContexts: [{ contextId: "doc-1:chunk-1", title: "Docs" }],
        sessionId: "session-1",
        total: 1,
      },
      ok: true,
    });
    await expect(handlers.get("settings:selectLocalSourcePath")(null, "local-music")).resolves.toEqual({
      data: { sourceId: "local-music" },
      ok: true,
    });
    await expect(
      handlers.get("settings:saveLocalSourcePath")(null, "local-music", "D:\\Music"),
    ).resolves.toEqual({
      data: {
        selectedPath: "D:\\Music",
        sourceId: "local-music",
      },
      ok: true,
    });
    await expect(handlers.get("intel:service:start")()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED" },
      ok: false,
    });
    await expect(handlers.get("agent:session:sendMessage")()).resolves.toMatchObject({
      error: { code: "NOT_IMPLEMENTED" },
      ok: false,
    });
    await expect(handlers.get("llm:provider:list")()).resolves.toEqual({
      data: [{ provider: "openai-compatible", status: "unconfigured" }],
      ok: true,
    });
    await expect(handlers.get("llm:provider:validate")(null, { provider: "openai" })).resolves.toEqual({
      data: { dryRun: true, provider: "openai" },
      ok: true,
    });
    await expect(handlers.get("llm:message:send")()).resolves.toMatchObject({
      error: { code: "NOT_IMPLEMENTED" },
      ok: false,
    });
    await expect(handlers.get("kb:index:start")()).resolves.toEqual({
      data: { source: "knowledge-index", status: "ready", summary: { docs: 1 } },
      ok: true,
    });
    await expect(handlers.get("llm:message:sendText")()).resolves.toEqual({
      data: { role: "assistant", text: "LLM reply" },
      ok: true,
    });
    await expect(handlers.get("permission:request:decide")()).resolves.toMatchObject({
      error: { code: "NOT_IMPLEMENTED" },
      ok: false,
    });
    await expect(handlers.get("tool:execute")()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED" },
      ok: false,
    });
    await expect(handlers.get("voice:dictation:start")()).resolves.toMatchObject({
      error: { code: "NOT_IMPLEMENTED" },
      ok: false,
    });
    await expect(handlers.get("widgets:getWidgets")()).resolves.toEqual({
      data: { page: "widgets" },
      ok: true,
    });
  });

  it("sanitizes provider exceptions into ApiResult errors", async () => {
    const handlers = createHandlers({
      getAppStatus() {
        throw new Error("D:\\Users\\mocairo\\secret\\token.txt failed");
      },
    });

    await expect(handlers.get("system:app:status")()).resolves.toMatchObject({
      error: {
        code: "UNKNOWN_ERROR",
        message: "Local operation failed",
      },
      ok: false,
    });
  });

  it("passes through provider ApiResult errors without wrapping them as success data", async () => {
    const handlers = createHandlers({
      sendLlmTextMessage() {
        return {
          error: {
            code: "LLM_SECRET_MISSING",
            message: "LLM provider secret is not configured.",
            retryable: false,
          },
          ok: false,
        };
      },
    });

    await expect(handlers.get("llm:message:sendText")()).resolves.toEqual({
      error: {
        code: "LLM_SECRET_MISSING",
        message: "LLM provider secret is not configured.",
        retryable: false,
      },
      ok: false,
    });
  });

  function createHandlers(provider) {
    const handlers = new Map();

    registerIpcHandlers(
      {
        handle(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      provider,
    );

    return handlers;
  }

  it("routes window control IPC events to the sender BrowserWindow", () => {
    const calls = [];
    const window = {
      close: () => calls.push("close"),
      isMaximized: () => false,
      maximize: () => calls.push("maximize"),
      minimize: () => calls.push("minimize"),
      unmaximize: () => calls.push("unmaximize"),
    };
    const handlers = new Map();

    registerWindowControlHandlers(
      {
        on(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      {
        fromWebContents(sender) {
          return sender === "main-web-contents" ? window : null;
        },
      },
    );

    handlers.get("window:minimize")({ sender: "main-web-contents" });
    handlers.get("window:maximize")({ sender: "main-web-contents" });
    handlers.get("window:close")({ sender: "main-web-contents" });
    handlers.get("window:minimize")({ sender: "detached-web-contents" });

    expect(calls).toEqual(["minimize", "maximize", "close"]);
  });

  it("restores a maximized sender window when maximize is clicked again", () => {
    const calls = [];
    const handlers = new Map();

    registerWindowControlHandlers(
      {
        on(channel, handler) {
          handlers.set(channel, handler);
        },
      },
      {
        fromWebContents() {
          return {
            isMaximized: () => true,
            maximize: () => calls.push("maximize"),
            unmaximize: () => calls.push("unmaximize"),
          };
        },
      },
    );

    handlers.get("window:maximize")({ sender: "main-web-contents" });

    expect(calls).toEqual(["unmaximize"]);
  });
});
