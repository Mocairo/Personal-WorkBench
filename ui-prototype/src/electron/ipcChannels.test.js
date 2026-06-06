import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, IPC_METHODS, IPC_STREAM_CHANNELS, IPC_WINDOW_CHANNELS } from "./ipcChannels";

describe("electron IPC channels", () => {
  it("defines stable channels for legacy page data and first-stage window.api methods", () => {
    expect(IPC_CHANNELS).toMatchObject({
      agent: {
        listAgents: "agent:agent:list",
        listSessions: "agent:session:list",
        sendMessage: "agent:session:sendMessage",
      },
      dashboard: { getHomeDashboard: "dashboard:getHomeDashboard" },
      agentChat: {
        getAgentChat: "agentChat:getAgentChat",
        prepareMessageDraft: "agentChat:message:prepareDraft",
        previewContextPack: "agentChat:context:preview",
        previewToolPlan: "agentChat:toolPlan:preview",
        resetSession: "agentChat:session:reset",
        runDryMessage: "agentChat:message:runDry",
        attachKnowledgeContext: "agentChat:knowledgeContext:attach",
        cancelStream: "agentChat:message:stream:cancel",
        clearKnowledgeContexts: "agentChat:knowledgeContext:clear",
        sendMessage: "agentChat:message:send",
        listKnowledgeContexts: "agentChat:knowledgeContext:list",
        removeKnowledgeContext: "agentChat:knowledgeContext:remove",
        streamMessage: "agentChat:message:stream",
      },
      knowledge: { getKnowledgeBase: "knowledge:getKnowledgeBase" },
      agentManagement: { getAgentManagement: "agentManagement:getAgentManagement" },
      repository: { getCodeRepository: "repository:getCodeRepository" },
      codeRepo: {
        getGitSummary: "codeRepo:git:summary",
        getMetrics: "codeRepo:metrics:get",
        getStructure: "codeRepo:structure:get",
        listFiles: "codeRepo:file:list",
        listRepositories: "codeRepo:repository:list",
        scanRepository: "codeRepo:repository:scan",
      },
      kb: {
        getDocumentPreview: "kb:document:preview",
        getIndexStatus: "kb:index:status",
        listDocuments: "kb:document:list",
        listTree: "kb:fileTree:list",
        listSources: "kb:source:list",
        searchLocal: "kb:search:local",
        startIndex: "kb:index:start",
      },
      music: { getLocalMusic: "music:getLocalMusic" },
      intel: {
        getDashboardSummary: "intel:dashboard:summary",
        getIntelCenter: "intel:getIntelCenter",
        getServiceStatus: "intel:service:status",
        getSourceHealth: "intel:source:health",
        listLogs: "intel:log:list",
        listReports: "intel:report:list",
        runUpdateNow: "intel:update:runNow",
        startService: "intel:service:start",
      },
      llm: {
        getProviderStatus: "llm:provider:status",
        listModels: "llm:model:list",
        listProviders: "llm:provider:list",
        sendMessage: "llm:message:send",
        sendTextMessage: "llm:message:sendText",
        validateProviderConfig: "llm:provider:validate",
      },
      settings: {
        getSettings: "settings:getSettings",
        saveLocalSourcePath: "settings:saveLocalSourcePath",
        selectLocalSourcePath: "settings:selectLocalSourcePath",
      },
      permission: {
        decideRequest: "permission:request:decide",
        evaluateToolRequest: "permission:tool:evaluate",
        listRequests: "permission:request:list",
      },
      system: {
        getAppStatus: "system:app:status",
        getSettingsSummary: "system:settings:summary",
        listTasks: "system:task:list",
      },
      tool: {
        dryRun: "tool:dryRun",
        execute: "tool:execute",
      },
      voice: {
        getVoiceStatus: "voice:status:get",
        startDictation: "voice:dictation:start",
      },
      widgets: { getWidgets: "widgets:getWidgets" },
    });

    expect(IPC_METHODS.map((item) => item.providerMethod)).toEqual(expect.arrayContaining([
      "getHomeDashboard",
      "getAgentChat",
      "prepareAgentChatMessageDraft",
      "previewAgentChatContextPack",
      "previewAgentChatToolPlan",
      "runAgentChatDryMessage",
      "resetAgentChatSession",
      "restoreAgentChatSession",
      "attachKnowledgeContextToAgentChat",
      "clearAgentChatKnowledgeContexts",
      "listAgentChatKnowledgeContexts",
      "removeKnowledgeContextFromAgentChat",
      "cancelAgentChatStream",
      "sendAgentChatMessage",
      "streamAgentChatMessage",
      "getKnowledgeBase",
      "getAgentManagement",
      "getCodeRepository",
      "getLocalMusic",
      "getIntelCenter",
      "getSettings",
      "selectLocalSourcePath",
      "saveLocalSourcePath",
      "getWidgets",
      "getAppStatus",
      "getSettingsSummary",
      "listTasks",
      "getIntelServiceStatus",
      "getIntelDashboardSummary",
      "getIntelSourceHealth",
      "listIntelReports",
      "listIntelLogs",
      "listCodeRepositories",
      "getCodeGitSummary",
      "listCodeRepositoryFiles",
      "getCodeRepositoryMetrics",
      "getCodeRepositoryStructure",
      "listKnowledgeSources",
      "listKnowledgeDocuments",
      "listKnowledgeFileTree",
      "getKnowledgeIndexStatus",
      "searchKnowledgeLocal",
      "getKnowledgeDocumentPreview",
      "startKnowledgeIndex",
      "listAgents",
      "listAgentSessions",
      "getMusicPlaybackState",
      "listLlmProviders",
      "listLlmModels",
      "getLlmProviderStatus",
      "validateLlmProviderConfig",
      "sendLlmTextMessage",
      "listPermissionRequests",
      "evaluateToolRequest",
      "dryRunTool",
    ]));
    expect(IPC_METHODS.find((item) => item.channel === "agent:session:sendMessage")).toMatchObject({
      permission: "notImplemented",
      providerMethod: "sendAgentMessage",
    });
    expect(IPC_METHODS.find((item) => item.channel === "llm:message:send")).toMatchObject({
      permission: "notImplemented",
      providerMethod: "sendLlmMessage",
    });
    expect(IPC_METHODS.find((item) => item.channel === "llm:message:sendText")).toMatchObject({
      providerMethod: "sendLlmTextMessage",
    });
    expect(IPC_METHODS.find((item) => item.channel === "agentChat:message:send")).toMatchObject({
      providerMethod: "sendAgentChatMessage",
    });
    expect(IPC_METHODS.find((item) => item.channel === "agentChat:message:stream")).toMatchObject({
      eventChannel: "agentChat:message:stream:event",
      providerMethod: "streamAgentChatMessage",
    });
    expect(IPC_METHODS.find((item) => item.channel === "agentChat:message:stream:cancel")).toMatchObject({
      providerMethod: "cancelAgentChatStream",
    });
    expect(IPC_METHODS.find((item) => item.channel === "agentChat:knowledgeContext:attach")).toMatchObject({
      providerMethod: "attachKnowledgeContextToAgentChat",
    });
    expect(IPC_METHODS.find((item) => item.channel === "agentChat:knowledgeContext:list")).toMatchObject({
      providerMethod: "listAgentChatKnowledgeContexts",
    });
    expect(IPC_METHODS.find((item) => item.channel === "tool:execute")).toMatchObject({
      permission: "denied",
      providerMethod: "executeTool",
    });
    expect(IPC_METHODS.find((item) => item.channel === "kb:index:start")).toMatchObject({
      providerMethod: "startKnowledgeIndex",
    });
    expect(IPC_METHODS.find((item) => item.channel === "kb:index:start").permission).toBeUndefined();
    expect(IPC_WINDOW_CHANNELS).toEqual({
      close: "window:close",
      maximize: "window:maximize",
      minimize: "window:minimize",
    });
    expect(IPC_STREAM_CHANNELS).toEqual({
      agentChat: {
        message: "agentChat:message:stream:event",
      },
    });
  });
});
