import { describe, expect, it } from "vitest";
import { pages } from "../data/pageRegistry";
import { dataProvider, resolveDataProvider } from "./dataProvider";

describe("data provider", () => {
  it("uses mock data as the default provider", async () => {
    const dashboard = await dataProvider.getHomeDashboard();

    expect(dashboard.homeTasks).toHaveLength(4);
    expect(dashboard.recentActivities.length).toBeGreaterThan(0);
    expect(dashboard.serviceState.map((item) => item.name)).toContain("local-intel");
    expect(dashboard.quickEntries.map((page) => page.id)).toEqual(
      pages.slice(1).map((page) => page.id),
    );
  });

  it("exposes mock data for every page module", async () => {
    await expect(dataProvider.getAgentChat()).resolves.toMatchObject({
      chatMessages: expect.any(Array),
      contextItems: expect.any(Array),
      toolCalls: expect.any(Array),
    });

    await expect(dataProvider.getKnowledgeBase()).resolves.toMatchObject({
      graphNodes: expect.any(Array),
      knowledgeDocuments: expect.any(Array),
    });
    await expect(dataProvider.listKnowledgeDocuments()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.searchKnowledgeLocal("requirements")).resolves.toMatchObject({
      results: expect.any(Array),
      source: "mock",
    });
    await expect(dataProvider.getKnowledgeDocumentPreview("mock-kb-doc-1")).resolves.toMatchObject({
      source: "mock",
    });

    await expect(dataProvider.getAgentManagement()).resolves.toMatchObject({
      agents: expect.any(Array),
      llmProviders: expect.any(Array),
      permissionMetrics: expect.any(Array),
    });
    await expect(dataProvider.listLlmProviders()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.listLlmModels()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.getLlmProviderStatus()).resolves.toMatchObject({
      status: expect.any(String),
    });
    await expect(dataProvider.validateLlmProviderConfig({ provider: "openai" })).resolves.toMatchObject({
      dryRun: true,
      provider: "openai",
    });
    await expect(dataProvider.listPermissionRequests()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.evaluateToolRequest({ permissionLevel: 2, toolId: "notes.write" })).resolves.toMatchObject({
      requiresApproval: true,
      status: "pending",
    });
    await expect(dataProvider.dryRunTool({ permissionLevel: 4, toolId: "shell.exec" })).resolves.toMatchObject({
      status: "denied",
      wouldExecute: false,
    });
    await expect(dataProvider.prepareAgentChatMessageDraft({ userText: "Hello" })).resolves.toMatchObject({
      status: "ready",
      userText: "Hello",
    });
    await expect(dataProvider.previewAgentChatContextPack({ userText: "Hello" })).resolves.toMatchObject({
      items: expect.any(Array),
      status: "ready",
    });
    await expect(dataProvider.previewAgentChatToolPlan({ userText: "write and run command" })).resolves.toMatchObject({
      items: expect.any(Array),
      wouldExecute: false,
    });
    await expect(dataProvider.runAgentChatDryMessage({ userText: "Hello" })).resolves.toMatchObject({
      dryRun: true,
      mockResponse: expect.any(Object),
    });
    await expect(dataProvider.sendAgentChatMessage({ userText: "Hello apiKey=sk-mock-secret" })).resolves.toMatchObject({
      assistantMessage: expect.objectContaining({ role: "assistant", source: "mock" }),
      dryRun: true,
      status: "mock",
      toolCalls: [
        expect.objectContaining({
          permission: "none",
          title: "No tools executed",
        }),
      ],
      userMessage: expect.objectContaining({ role: "user", text: "Hello [redacted]" }),
    });
    const streamEvents = [];
    await expect(dataProvider.streamAgentChatMessage(
      { requestId: "mock-stream-1", userText: "Hello apiKey=sk-mock-secret" },
      { onEvent: (event) => streamEvents.push(event) },
    )).resolves.toMatchObject({
      assistantMessage: expect.objectContaining({ role: "assistant", source: "mock" }),
      dryRun: true,
      requestId: "mock-stream-1",
      status: "mock",
      toolCalls: [
        expect.objectContaining({
          permission: "none",
          title: "No tools executed",
        }),
      ],
      userMessage: expect.objectContaining({ role: "user", text: "Hello [redacted]" }),
    });
    expect(streamEvents).toEqual([
      expect.objectContaining({ requestId: "mock-stream-1", status: "generating", type: "start" }),
      expect.objectContaining({ requestId: "mock-stream-1", type: "token" }),
      expect.objectContaining({ requestId: "mock-stream-1", status: "done", type: "done" }),
    ]);
    await expect(dataProvider.cancelAgentChatStream({ requestId: "mock-stream-1" })).resolves.toEqual({
      requestId: "mock-stream-1",
      status: "cancelled",
    });
    expect(JSON.stringify(streamEvents)).not.toMatch(/sk-mock-secret|apiKey|token=/);
    expect(JSON.stringify(await dataProvider.sendLlmTextMessage({ userText: "Hello sk-mock-secret" }))).not.toMatch(/sk-mock-secret|apiKey/);

    await expect(dataProvider.getCodeRepository()).resolves.toMatchObject({
      repoFiles: expect.any(Array),
    });
    await expect(dataProvider.listCodeRepositoryFiles()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.getCodeRepositoryMetrics()).resolves.toMatchObject({
      modules: expect.any(Number),
    });
    await expect(dataProvider.getCodeRepositoryStructure()).resolves.toEqual(expect.any(Array));

    await expect(dataProvider.getLocalMusic()).resolves.toMatchObject({
      audioMetadata: expect.any(Array),
      tracks: expect.any(Array),
    });

    await expect(dataProvider.getIntelCenter()).resolves.toMatchObject({
      collectionSteps: expect.any(Array),
      intelCards: expect.any(Array),
      intelSources: expect.any(Array),
    });
    await expect(dataProvider.getIntelServiceStatus()).resolves.toMatchObject({
      serviceId: "local-intel",
      status: expect.any(String),
    });
    await expect(dataProvider.getIntelDashboardSummary()).resolves.toMatchObject({
      reportCount: expect.any(Number),
    });
    await expect(dataProvider.getIntelSourceHealth()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.listIntelReports()).resolves.toEqual(expect.any(Array));
    await expect(dataProvider.listIntelLogs()).resolves.toEqual(expect.any(Array));

    await expect(dataProvider.getWidgets()).resolves.toMatchObject({
      clipboardItems: expect.any(Array),
      systemMetrics: expect.any(Array),
    });

    await expect(dataProvider.getSettings()).resolves.toMatchObject({
      sources: expect.any(Array),
      summary: expect.any(Object),
    });
  });

  it("can resolve the future local provider explicitly", () => {
    expect(resolveDataProvider("local").providerName).toBe("local");
    expect(resolveDataProvider("mock").providerName).toBe("mock");
    expect(resolveDataProvider("unknown").providerName).toBe("mock");
  });

  it("uses the local provider by default when window.api is available", () => {
    const originalWindow = globalThis.window;

    globalThis.window = { api: {} };

    expect(resolveDataProvider().providerName).toBe("local");

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("keeps desktopApi as a compatibility signal", () => {
    const originalWindow = globalThis.window;

    globalThis.window = { desktopApi: {} };

    expect(resolveDataProvider().providerName).toBe("local");

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });
});
