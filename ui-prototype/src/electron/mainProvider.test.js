import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMainDataProvider } from "./mainProvider";

describe("main process data provider", () => {
  it("keeps mock data for general pages and uses local adapters where available", async () => {
    const localIntelRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-intel-"));
    await fs.mkdir(path.join(localIntelRootDir, "reports"), { recursive: true });
    await fs.writeFile(path.join(localIntelRootDir, "reports", "2026-05-31.md"), "# Report\n");

    const codeRepositoryRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-code-"));
    await fs.mkdir(path.join(codeRepositoryRootDir, "src"), { recursive: true });
    await fs.writeFile(path.join(codeRepositoryRootDir, "src", "main.jsx"), "export default null;\n");

    const knowledgeBaseRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-"));
    await fs.writeFile(path.join(knowledgeBaseRootDir, "README.md"), "# Knowledge\n");

    const localMusicRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-music-"));
    await fs.mkdir(path.join(localMusicRootDir, "Artist"), { recursive: true });
    await fs.writeFile(path.join(localMusicRootDir, "Artist", "Track.flac"), "");

    const agentManagementRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-agents-"));
    await fs.writeFile(
      path.join(agentManagementRootDir, "agents.json"),
      JSON.stringify({
        agents: [{ name: "Repo Analyst", state: "online", tools: ["git", "parser"] }],
        permissionMetrics: ["File read", "Command execution"],
      }),
    );

    const agentChatRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-chat-"));
    await fs.writeFile(
      path.join(agentChatRootDir, "session.json"),
      JSON.stringify({
        chatMessages: [{ role: "user", text: "Map local data sources" }],
        contextItems: ["docs/ui-data-contract.md"],
        toolCalls: [{ title: "Read contract", meta: "docs", state: "done" }],
      }),
    );

    const provider = createMainDataProvider({
      agentChatRootDir,
      agentManagementRootDir,
      codeRepositoryRootDir,
      gitStatusReader: async () => "## main\n M src/main.jsx",
      knowledgeBaseRootDir,
      localIntelRootDir,
      localMusicRootDir,
    });

    await expect(provider.getHomeDashboard()).resolves.toMatchObject({
      homeTasks: expect.arrayContaining([
        expect.objectContaining({ module: "Code Repository" }),
        expect.objectContaining({ module: "Local Music" }),
      ]),
      quickEntries: expect.any(Array),
      serviceState: expect.arrayContaining([
        expect.objectContaining({ name: "code", value: "1 changes" }),
      ]),
    });
    await expect(provider.getAgentChat()).resolves.toMatchObject({
      chatMessages: [{ role: "user", text: "Map local data sources" }],
      contextItems: [
        expect.objectContaining({
          relativePath: "docs/ui-data-contract.md",
          source: "local",
          title: "docs/ui-data-contract.md",
        }),
      ],
      toolCalls: [{ title: "Read contract", meta: "docs", state: "done" }],
    });
    await expect(provider.getIntelCenter()).resolves.toMatchObject({
      intelCards: [{ title: "Report", source: "local", priority: "high" }],
    });
    await expect(provider.getCodeRepository()).resolves.toMatchObject({
      gitState: { branch: "main", changed: 1 },
      repoMetrics: { modules: 1, symbols: 1, changed: 1 },
    });
    await expect(provider.getKnowledgeBase()).resolves.toMatchObject({
      indexStats: { docs: 1, pending: 0, progress: "100%" },
      knowledgeDocuments: [{ title: "README.md", tag: "markdown", state: "indexed" }],
    });
    await expect(provider.getAgentManagement()).resolves.toMatchObject({
      agents: [{ name: "Repo Analyst", state: "online", tools: "git, parser" }],
      permissionMetrics: ["File read", "Command execution"],
    });
    await expect(provider.getLocalMusic()).resolves.toMatchObject({
      audioMetadata: expect.arrayContaining([{ label: "Tracks", value: "1" }]),
      tracks: [{ title: "Track", artist: "Artist", length: "--:--" }],
    });
    await expect(provider.getWidgets()).resolves.toMatchObject({
      clipboardItems: expect.any(Array),
      systemMetrics: [
        { label: "CPU", value: expect.stringMatching(/%$/) },
        { label: "Memory", value: expect.stringMatching(/%$/) },
        { label: "Disk", value: expect.stringMatching(/%$/) },
      ],
    });
    await expect(provider.getSettings()).resolves.toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: "agent-chat", state: "ready" }),
        expect.objectContaining({ id: "agent-management", state: "ready" }),
      ]),
      summary: expect.objectContaining({ total: 7 }),
    });
  });

  it("uses persisted local source paths when explicit options are not provided", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-config-"));
    const agentChatSessionPath = path.join(rootDir, "chat", "session.json");
    const agentManagementConfigPath = path.join(rootDir, "agents", "agents.json");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");

    await fs.mkdir(path.dirname(agentChatSessionPath), { recursive: true });
    await fs.mkdir(path.dirname(agentManagementConfigPath), { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(
      agentChatSessionPath,
      JSON.stringify({ chatMessages: [{ role: "user", text: "Loaded from persisted config" }] }),
    );
    await fs.writeFile(
      agentManagementConfigPath,
      JSON.stringify({ agents: [{ name: "Config Agent", state: "online", tools: ["config"] }] }),
    );
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          agentChatSession: agentChatSessionPath,
          agentManagementConfig: agentManagementConfigPath,
        },
      }),
    );

    const provider = createMainDataProvider({ localSourcesConfigPath });

    await expect(provider.getAgentChat()).resolves.toMatchObject({
      chatMessages: [{ role: "user", text: "Loaded from persisted config" }],
    });
    await expect(provider.getAgentManagement()).resolves.toMatchObject({
      agents: [{ name: "Config Agent", state: "online", tools: "config" }],
    });
    await expect(provider.getSettings()).resolves.toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: "agent-chat", path: agentChatSessionPath, state: "ready" }),
        expect.objectContaining({
          id: "agent-management",
          path: agentManagementConfigPath,
          state: "ready",
        }),
      ]),
    });
  });

  it("exposes phase-6 read-only Agent config and session summaries", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-agent-phase6-"));
    const agentChatSessionPath = path.join(rootDir, "chat", "session.json");
    const agentManagementConfigPath = path.join(rootDir, "agents", "agents.json");

    await fs.mkdir(path.dirname(agentChatSessionPath), { recursive: true });
    await fs.mkdir(path.dirname(agentManagementConfigPath), { recursive: true });
    await fs.writeFile(
      agentManagementConfigPath,
      JSON.stringify({
        agents: [
          {
            id: "agent-repo",
            model: { apiKey: "sk-hidden", model: "gpt-4.1-mini", provider: "openai" },
            name: "Repo Analyst",
            permissionPolicy: { commandExecution: "ask", fileRead: "allow" },
            runtime: { lastRun: "2026-06-03T10:00:00.000Z", state: "ready" },
            state: "online",
            tools: [{ name: "Repo Scan", permissionLevel: "allow" }],
          },
        ],
      }),
    );
    await fs.writeFile(
      agentChatSessionPath,
      JSON.stringify({
        chatMessages: [{ role: "assistant", text: "Loaded local session token=sk-chat" }],
        contextItems: [{ chunks: 4, label: "docs/agent.md", tokens: "1.1k", type: "doc" }],
        session: {
          activeAgentId: "agent-repo",
          id: "session-agent",
          lastUpdated: "2026-06-03T11:00:00.000Z",
          title: "Agent readonly session",
        },
        toolCalls: [{ duration: "320ms", permission: "read allowed", title: "Read config" }],
      }),
    );

    const provider = createMainDataProvider({
      agentChatSessionPath,
      agentManagementConfigPath,
    });

    await expect(provider.listAgents()).resolves.toEqual([
      expect.objectContaining({
        id: "agent-repo",
        model: "openai / gpt-4.1-mini",
        name: "Repo Analyst",
        tools: "Repo Scan",
      }),
    ]);
    await expect(provider.getAgentChat()).resolves.toMatchObject({
      chatMessages: [{ role: "assistant", text: "Loaded local session token=[redacted]" }],
      contextItems: [{ chunks: 4, title: "docs/agent.md", tokens: "1.1k", type: "doc" }],
      session: {
        activeAgentId: "agent-repo",
        sessionId: "session-agent",
        title: "Agent readonly session",
      },
      toolCalls: [{ duration: "320ms", permission: "read allowed", title: "Read config" }],
    });
    await expect(provider.listAgentSessions()).resolves.toEqual([
      expect.objectContaining({
        activeAgentId: "agent-repo",
        messageCount: 1,
        sessionId: "session-agent",
        title: "Agent readonly session",
      }),
    ]);
    expect(JSON.stringify(await provider.getAgentManagement())).not.toMatch(/sk-hidden/);
  });

  it("exposes phase-7 LLM, secret and permission skeletons without leaking secrets", async () => {
    const provider = createMainDataProvider({
      llmProviders: [
        {
          apiKey: "sk-main-provider-secret",
          id: "openai",
          label: "OpenAI",
          model: "gpt-4.1-mini",
          provider: "openai",
          secretHint: "sk-main-provider-secret",
          status: "ready",
        },
      ],
    });

    await expect(provider.listLlmProviders()).resolves.toEqual([
      expect.objectContaining({
        hasSecret: true,
        id: "openai",
        provider: "openai",
        secretHint: "[redacted]",
        status: "ready",
      }),
    ]);
    await expect(provider.listLlmModels()).resolves.toEqual([
      expect.objectContaining({
        model: "gpt-4.1-mini",
        provider: "openai",
        status: "ready",
      }),
    ]);
    await expect(provider.getLlmProviderStatus()).resolves.toMatchObject({
      provider: "openai",
      status: "ready",
    });
    await expect(provider.validateLlmProviderConfig({ apiKey: "sk-dry-run", provider: "openai" })).resolves.toMatchObject({
      dryRun: true,
      provider: "openai",
      status: "ready",
    });
    await expect(provider.listPermissionRequests()).resolves.toEqual([
      expect.objectContaining({ permissionLevel: 2, requiresApproval: true, status: "pending" }),
    ]);
    await expect(provider.evaluateToolRequest({ permissionLevel: 2, toolId: "notes.write" })).resolves.toMatchObject({
      decision: "approval-required",
      requiresApproval: true,
      status: "pending",
    });
    await expect(provider.dryRunTool({ permissionLevel: 4, toolId: "shell.exec" })).resolves.toMatchObject({
      status: "denied",
      wouldExecute: false,
    });
    await expect(provider.getSettings()).resolves.toMatchObject({
      llmModels: [expect.objectContaining({ model: "gpt-4.1-mini", status: "ready" })],
      llmProviders: [expect.objectContaining({ provider: "openai", secretHint: "[redacted]" })],
      secrets: [expect.objectContaining({ hasSecret: true, secretHint: "[redacted]" })],
    });
    await expect(provider.getAgentChat()).resolves.toMatchObject({
      llmProviderStatus: expect.objectContaining({ provider: "openai", status: "ready" }),
      permissionSummary: expect.objectContaining({ requiresApproval: true, status: "pending" }),
    });
    await expect(provider.getAgentManagement()).resolves.toMatchObject({
      llmProviders: [expect.objectContaining({ provider: "openai", status: "ready" })],
    });
    expect(JSON.stringify(await provider.getSettings())).not.toMatch(/sk-main-provider-secret|sk-dry-run|apiKey/);
  });

  it("exposes phase-8 Agent Chat dry-run previews without executing LLM or tools", async () => {
    const provider = createMainDataProvider({
      llmClient: () => {
        throw new Error("real LLM should not be called");
      },
      toolExecutor: () => {
        throw new Error("real tool should not be called");
      },
    });

    await expect(provider.prepareAgentChatMessageDraft({ userText: "Use token=sk-main-draft" })).resolves.toMatchObject({
      status: "ready",
      userText: "Use [redacted]",
    });
    await expect(provider.previewAgentChatContextPack({ userText: "Summarize workspace" })).resolves.toMatchObject({
      items: expect.any(Array),
      status: "ready",
    });
    await expect(provider.previewAgentChatToolPlan({ userText: "write a note and run shell" })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ decision: "requiresApproval" }),
        expect.objectContaining({ decision: "denied" }),
      ]),
      wouldExecute: false,
    });

    const result = await provider.runAgentChatDryMessage({ userText: "Summarize workspace apiKey=sk-hidden" });
    expect(result).toMatchObject({
      dryRun: true,
      mockResponse: expect.objectContaining({ role: "assistant", source: "dry-run" }),
      status: expect.stringMatching(/ready|permission_required/),
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-main-draft|sk-hidden|apiKey|token=/);
  });

  it("sends phase-9 Agent Chat text through LLM provider without executing tools", async () => {
    const llmClient = vi.fn(async (input) => ({
      data: {
        metadata: {
          model: "gpt-4.1-mini",
          provider: "openai",
          toolCalls: 0,
        },
        role: "assistant",
        text: `Live response for ${input.userText}`,
      },
      ok: true,
    }));
    const toolExecutor = vi.fn(() => {
      throw new Error("tool execution should not run");
    });
    const provider = createMainDataProvider({
      llmClient,
      toolExecutor,
    });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-1",
      userText: "Summarize workspace apiKey=sk-live-hidden",
    });

    expect(result).toMatchObject({
      assistantMessage: {
        role: "assistant",
        source: "llm",
        text: "Live response for Summarize workspace [redacted]",
      },
      llm: {
        metadata: {
          provider: "openai",
          toolCalls: 0,
        },
      },
      status: "ready",
      toolCalls: [
        expect.objectContaining({
          permission: "none",
          state: "done",
          title: "No tools executed",
        }),
      ],
      userMessage: {
        role: "user",
        text: "Summarize workspace [redacted]",
      },
    });
    expect(llmClient).toHaveBeenCalledTimes(1);
    expect(llmClient.mock.calls[0][0]).toMatchObject({
      contextPack: { items: expect.any(Array) },
      userText: "Summarize workspace [redacted]",
    });
    expect(toolExecutor).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/sk-live-hidden|apiKey/);
  });

  it("returns a readable phase-9 Agent Chat error result when LLM provider is missing secret", async () => {
    const provider = createMainDataProvider({
      llmClient: async () => ({
        error: {
          code: "LLM_SECRET_MISSING",
          message: "LLM provider secret is not configured.",
          retryable: false,
        },
        ok: false,
      }),
      toolExecutor: () => {
        throw new Error("tool execution should not run");
      },
    });

    await expect(provider.sendAgentChatMessage({ userText: "Hello" })).resolves.toMatchObject({
      error: {
        code: "LLM_SECRET_MISSING",
        message: "LLM provider secret is not configured.",
      },
      ok: false,
    });
  });

  it("streams phase-10 Agent Chat replies, persists the session in userData and never executes tools", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-stream-user-data-"));
    const events = [];
    const llmStreamClient = vi.fn(async (input, streamOptions) => {
      streamOptions.onEvent({
        requestId: input.requestId,
        status: "generating",
        type: "start",
      });
      streamOptions.onEvent({
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        requestId: input.requestId,
        status: "generating",
        text: "Streamed ",
        token: "Streamed ",
        type: "token",
      });
      streamOptions.onEvent({
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        requestId: input.requestId,
        status: "generating",
        text: "Streamed answer",
        token: "answer",
        type: "token",
      });
      streamOptions.onEvent({
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        requestId: input.requestId,
        status: "done",
        text: "Streamed answer",
        type: "done",
      });

      return {
        data: {
          metadata: { apiKey: "sk-should-not-return", model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
          role: "assistant",
          text: "Streamed answer",
        },
        ok: true,
      };
    });
    const toolExecutor = vi.fn(() => {
      throw new Error("tool execution should not run");
    });
    const provider = createMainDataProvider({
      llmStreamClient,
      toolExecutor,
      userDataDir,
    });

    const result = await provider.streamAgentChatMessage(
      {
        requestId: "stream-main-1",
        sessionId: "session-1",
        userText: "Summarize workspace apiKey=sk-live-hidden",
      },
      {
        onEvent: (event) => events.push(event),
      },
    );

    expect(result).toMatchObject({
      assistantMessage: {
        role: "assistant",
        source: "llm",
        text: "Streamed answer",
      },
      requestId: "stream-main-1",
      status: "ready",
      toolCalls: [
        expect.objectContaining({
          permission: "none",
          title: "No tools executed",
        }),
      ],
      userMessage: {
        role: "user",
        text: "Summarize workspace [redacted]",
      },
    });
    expect(events).toEqual([
      expect.objectContaining({ requestId: "stream-main-1", status: "generating", type: "start" }),
      expect.objectContaining({ requestId: "stream-main-1", text: "Streamed ", token: "Streamed ", type: "token" }),
      expect.objectContaining({ requestId: "stream-main-1", text: "Streamed answer", token: "answer", type: "token" }),
      expect.objectContaining({ requestId: "stream-main-1", status: "done", text: "Streamed answer", type: "done" }),
    ]);
    expect(llmStreamClient).toHaveBeenCalledTimes(1);
    expect(toolExecutor).not.toHaveBeenCalled();

    const persistedPath = path.join(userDataDir, "sessions", "agent-chat-session.json");
    const persisted = await fs.readFile(persistedPath, "utf8");
    expect(persisted).toContain("Streamed answer");
    expect(persisted).not.toMatch(/sk-live-hidden|sk-should-not-return|apiKey|token|secret|Authorization/i);
    expect(JSON.stringify(result)).not.toMatch(/sk-live-hidden|sk-should-not-return|apiKey/);
  });

  it("cancels an active phase-10 Agent Chat stream through its requestId", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-stream-cancel-"));
    const events = [];
    let startStream;
    let abortSeen = false;
    const started = new Promise((resolve) => {
      startStream = resolve;
    });
    const llmStreamClient = vi.fn((input, streamOptions) => {
      streamOptions.onEvent({
        requestId: input.requestId,
        status: "generating",
        type: "start",
      });
      startStream();

      return new Promise((resolve) => {
        streamOptions.abortSignal.addEventListener("abort", () => {
          abortSeen = true;
          streamOptions.onEvent({
            requestId: input.requestId,
            status: "cancelled",
            text: "partial",
            type: "cancelled",
          });
          resolve({
            data: {
              metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
              role: "assistant",
              status: "cancelled",
              text: "partial",
            },
            ok: true,
          });
        });
      });
    });
    const provider = createMainDataProvider({
      llmStreamClient,
      userDataDir,
    });

    const stream = provider.streamAgentChatMessage(
      {
        requestId: "stream-cancel-1",
        userText: "Cancel this",
      },
      {
        onEvent: (event) => events.push(event),
      },
    );
    await started;

    await expect(provider.cancelAgentChatStream({ requestId: "stream-cancel-1" })).resolves.toMatchObject({
      requestId: "stream-cancel-1",
      status: "cancelled",
    });
    await expect(stream).resolves.toMatchObject({
      assistantMessage: {
        status: "cancelled",
        text: "partial",
      },
      requestId: "stream-cancel-1",
      status: "cancelled",
    });
    expect(abortSeen).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({ requestId: "stream-cancel-1", type: "start" }),
      expect.objectContaining({ requestId: "stream-cancel-1", status: "cancelled", text: "partial", type: "cancelled" }),
    ]);
  });

  it("keeps planned Level 1 Agent Chat tools pending until the user approves them", async () => {
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        text: "This should wait for approval.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({ llmClient });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-1",
      userText: "search docs for settings",
    });

    expect(result).toMatchObject({
      status: "approval_required",
      toolCalls: [
        expect.objectContaining({
          state: "pending",
          status: "pending",
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(llmClient).not.toHaveBeenCalled();
  });

  it("executes approved Level 1 tools and passes sanitized summaries into the LLM prompt", async () => {
    const llmClient = vi.fn(async (input) => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: `Final with ${input.contextPack.items.map((item) => item.title).join(" | ")}`,
      },
      ok: true,
    }));
    const provider = createMainDataProvider({ llmClient });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-1",
      toolPolicy: {
        approvedToolIds: ["kb.searchLocal"],
      },
      userText: "search docs for settings apiKey=sk-tool-hidden",
    });

    expect(result).toMatchObject({
      assistantMessage: {
        role: "assistant",
        source: "llm",
        status: "ready",
      },
      status: "ready",
      toolCalls: [
        expect.objectContaining({
          state: "completed",
          status: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
      toolResultsSummary: [
        expect.objectContaining({
          status: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(llmClient).toHaveBeenCalledTimes(1);
    expect(llmClient.mock.calls[0][0].contextPack.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "tool", title: "Tool: Knowledge Search" }),
    ]));
    expect(JSON.stringify(result)).not.toMatch(/sk-tool-hidden|apiKey|token=|secret=|Authorization/i);
  });

  it("auto-allows only Level 1 read-only tools and leaves Level 4 plans denied", async () => {
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: "Final after read-only tools.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({ llmClient });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-1",
      toolPolicy: {
        autoAllowLevel1ReadOnly: true,
      },
      userText: "search docs and run shell",
    });

    expect(result.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "completed", toolId: "kb.searchLocal" }),
      expect.objectContaining({ state: "denied", toolId: "shell.exec" }),
    ]));
    expect(llmClient).toHaveBeenCalledTimes(1);
  });

  it("keeps tool summaries when the second LLM summary fails", async () => {
    const llmClient = vi.fn(async () => ({
      error: {
        code: "LLM_REQUEST_FAILED",
        message: "LLM request failed token=sk-error-secret",
        retryable: true,
      },
      ok: false,
    }));
    const provider = createMainDataProvider({ llmClient });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-1",
      toolPolicy: {
        autoAllowLevel1ReadOnly: true,
      },
      userText: "search docs",
    });

    expect(result).toMatchObject({
      assistantMessage: {
        role: "assistant",
        status: "error",
      },
      status: "error",
      toolResultsSummary: [
        expect.objectContaining({ status: "completed", toolId: "kb.searchLocal" }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-error-secret|token=/);
  });

  it("persists tool-augmented turns to userData without secrets or raw oversized results", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-tool-user-data-"));
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: {
          apiKey: "sk-llm-metadata-secret",
          model: "gpt-4.1-mini",
          provider: "openai",
          toolCalls: 1,
        },
        role: "assistant",
        text: "Final answer token=sk-final-secret",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      llmClient,
      userDataDir,
    });

    await provider.sendAgentChatMessage({
      sessionId: "session-1",
      toolPolicy: {
        autoAllowLevel1ReadOnly: true,
      },
      userText: "search docs apiKey=sk-user-secret D:\\private\\workspace\\doc.md",
    });

    const persistedPath = path.join(userDataDir, "sessions", "agent-chat-session.json");
    const persisted = await fs.readFile(persistedPath, "utf8");
    const parsed = JSON.parse(persisted);

    expect(parsed).toMatchObject({
      finalAnswer: "Final answer [redacted]",
      toolPlan: {
        items: [expect.objectContaining({ toolId: "kb.searchLocal" })],
      },
      toolResultsSummary: [expect.objectContaining({ toolId: "kb.searchLocal" })],
    });
    expect(persisted).not.toMatch(/sk-|apiKey|token|secret|Authorization|requestHeaders|D:\\private/i);
  });

  it("saves local source paths through the settings provider actions", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-save-config-"));
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const localMusicRootDir = path.join(rootDir, "Music");
    await fs.mkdir(localMusicRootDir);

    const provider = createMainDataProvider({ localSourcesConfigPath });

    await expect(provider.saveLocalSourcePath("local-music", localMusicRootDir)).resolves.toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: "local-music", path: localMusicRootDir, state: "ready" }),
      ]),
    });
    await expect(provider.getLocalMusic()).resolves.toMatchObject({
      audioMetadata: expect.arrayContaining([{ label: "Library", value: "ready" }]),
    });
  });

  it("selects a local source path through a dialog and refreshes settings", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-select-config-"));
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const docsRootDir = path.join(rootDir, "docs");
    await fs.mkdir(docsRootDir);

    const provider = createMainDataProvider({
      dialog: {
        async showOpenDialog() {
          return { canceled: false, filePaths: [docsRootDir] };
        },
      },
      localSourcesConfigPath,
    });

    await expect(provider.selectLocalSourcePath("knowledge-base")).resolves.toMatchObject({
      canceled: false,
      settings: {
        sources: expect.arrayContaining([
          expect.objectContaining({ id: "knowledge-base", path: docsRootDir, state: "ready" }),
        ]),
      },
    });
  });

  it("uses explicit mock status when phase-2 local paths are not configured", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-phase2-mock-"));
    const provider = createMainDataProvider({
      localSourcesConfigPath: path.join(rootDir, "missing.json"),
    });

    await expect(provider.getKnowledgeBase()).resolves.toMatchObject({
      providerStatus: {
        configured: false,
        sourceId: "knowledgeBasePath",
        status: "mock",
      },
      sourceHealth: {
        configured: false,
        status: "unconfigured",
      },
    });
    await expect(provider.getCodeRepository()).resolves.toMatchObject({
      providerStatus: {
        configured: false,
        sourceId: "codeRepositoryPath",
        status: "mock",
      },
      sourceHealth: {
        configured: false,
        status: "unconfigured",
      },
    });
    await expect(provider.listCodeRepositoryFiles()).resolves.toEqual(expect.any(Array));
    await expect(provider.getCodeRepositoryMetrics()).resolves.toMatchObject({
      modules: expect.any(Number),
    });
    await expect(provider.getCodeRepositoryStructure()).resolves.toEqual(expect.any(Array));
    await expect(provider.getIntelCenter()).resolves.toMatchObject({
      providerStatus: {
        configured: false,
        sourceId: "localIntelPath",
        status: "mock",
      },
      sourceHealth: {
        configured: false,
        status: "unconfigured",
      },
    });
    await expect(provider.getLocalMusic()).resolves.toMatchObject({
      providerStatus: {
        configured: false,
        sourceId: "musicLibraryPath",
        status: "mock",
      },
      sourceHealth: {
        configured: false,
        status: "unconfigured",
      },
    });
  });

  it("attaches ready source status when persisted phase-2 paths are configured", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-phase2-ready-"));
    const docsRootDir = path.join(rootDir, "docs");
    const repoRootDir = path.join(rootDir, "repo");
    const intelRootDir = path.join(rootDir, "intel");
    const musicRootDir = path.join(rootDir, "Music");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");

    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "real-doc.md"), "# Real docs\n");
    await fs.mkdir(path.join(repoRootDir, "src"), { recursive: true });
    await fs.writeFile(path.join(repoRootDir, "src", "index.js"), "export const ready = true;\n");
    await fs.mkdir(path.join(intelRootDir, "reports"), { recursive: true });
    await fs.mkdir(path.join(intelRootDir, "logs"), { recursive: true });
    await fs.writeFile(path.join(intelRootDir, "reports", "2026-06-01.md"), "# Report\n");
    await fs.writeFile(
      path.join(intelRootDir, "logs", "2026-06-01.jsonl"),
      '{"level":"info","message":"report generated"}\n',
    );
    await fs.mkdir(path.join(musicRootDir, "Artist"), { recursive: true });
    await fs.writeFile(path.join(musicRootDir, "Artist", "Track.flac"), "");
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          codeRepositoryPath: repoRootDir,
          knowledgeBasePath: docsRootDir,
          localIntelPath: intelRootDir,
          musicLibraryPath: musicRootDir,
        },
      }),
    );

    const provider = createMainDataProvider({
      gitStatusReader: async () => "## main\n",
      localSourcesConfigPath,
    });

    await expect(provider.getKnowledgeBase()).resolves.toMatchObject({
      knowledgeDocuments: [expect.objectContaining({ title: "real-doc.md" })],
      providerStatus: { configured: true, sourceId: "knowledgeBasePath", status: "ready" },
      sourceHealth: { configured: true, status: "ready" },
    });
    await expect(provider.listKnowledgeDocuments()).resolves.toEqual([
      expect.objectContaining({
        relativePath: "real-doc.md",
        source: "local",
        title: "real-doc.md",
      }),
    ]);
    await expect(provider.searchKnowledgeLocal("Real docs")).resolves.toMatchObject({
      results: [expect.objectContaining({ relativePath: "real-doc.md", source: "local" })],
      source: "local",
    });
    const [document] = await provider.listKnowledgeDocuments();
    await expect(provider.getKnowledgeDocumentPreview(document.id)).resolves.toMatchObject({
      id: document.id,
      preview: expect.stringContaining("Real docs"),
      relativePath: "real-doc.md",
      source: "local",
    });
    await expect(provider.getCodeRepository()).resolves.toMatchObject({
      providerStatus: { configured: true, sourceId: "codeRepositoryPath", status: "ready" },
      sourceHealth: { configured: true, status: "ready" },
    });
    await expect(provider.listCodeRepositoryFiles()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "src/index.js", source: "local" }),
    ]));
    await expect(provider.getCodeRepositoryMetrics()).resolves.toMatchObject({
      fileCount: 1,
      modules: 1,
    });
    await expect(provider.getCodeRepositoryStructure()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "src" }),
    ]));
    await expect(provider.getIntelCenter()).resolves.toMatchObject({
      intelCards: [expect.objectContaining({ relativePath: "reports/2026-06-01.md", title: "Report" })],
      providerStatus: { configured: true, sourceId: "localIntelPath", status: "ready" },
      sourceHealth: { configured: true, status: "ready" },
      workspaceStatus: { reportCount: 1 },
    });
    await expect(provider.listIntelReports()).resolves.toEqual([
      expect.objectContaining({ relativePath: "reports/2026-06-01.md", title: "Report" }),
    ]);
    await expect(provider.listIntelLogs()).resolves.toEqual([
      expect.objectContaining({ level: "info", message: "report generated" }),
    ]);
    await expect(provider.getLocalMusic()).resolves.toMatchObject({
      providerStatus: { configured: true, sourceId: "musicLibraryPath", status: "ready" },
      sourceHealth: { configured: true, status: "ready" },
      tracks: [expect.objectContaining({ title: "Track" })],
    });
  });

  it("exposes first-stage read-only backend capabilities", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-phase1-"));
    const docsRootDir = path.join(rootDir, "docs");
    const repoRootDir = path.join(rootDir, "repo");
    const intelRootDir = path.join(rootDir, "intel");
    const musicRootDir = path.join(rootDir, "Music");
    const agentsRootDir = path.join(rootDir, "agents");
    const chatRootDir = path.join(rootDir, "chat");

    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "README.md"), "# Docs\n");
    await fs.mkdir(path.join(repoRootDir, "src"), { recursive: true });
    await fs.writeFile(path.join(repoRootDir, "src", "index.js"), "export const ok = true;\n");
    await fs.mkdir(path.join(intelRootDir, "data"), { recursive: true });
    await fs.mkdir(path.join(intelRootDir, "reports"), { recursive: true });
    await fs.mkdir(path.join(intelRootDir, "logs"), { recursive: true });
    await fs.writeFile(path.join(intelRootDir, "data", "intel.sqlite"), "");
    await fs.writeFile(path.join(intelRootDir, "reports", "2026-06-01.md"), "# Report\n\nDaily summary\n");
    await fs.writeFile(
      path.join(intelRootDir, "logs", "2026-06-01.jsonl"),
      '{"level":"warn","message":"token=sk-secret trimmed"}\n',
    );
    await fs.mkdir(path.join(musicRootDir, "Artist"), { recursive: true });
    await fs.writeFile(path.join(musicRootDir, "Artist", "Track.mp3"), "");
    await fs.mkdir(agentsRootDir, { recursive: true });
    await fs.writeFile(
      path.join(agentsRootDir, "agents.json"),
      JSON.stringify({ agents: [{ name: "Reader", state: "online", tools: ["kb"] }] }),
    );
    await fs.mkdir(chatRootDir, { recursive: true });
    await fs.writeFile(
      path.join(chatRootDir, "session.json"),
      JSON.stringify({ chatMessages: [{ role: "user", text: "hello" }] }),
    );

    const provider = createMainDataProvider({
      agentChatSessionPath: path.join(chatRootDir, "session.json"),
      agentManagementConfigPath: path.join(agentsRootDir, "agents.json"),
      codeRepositoryRootDir: repoRootDir,
      gitStatusReader: async () => "## main\n",
      knowledgeBaseRootDir: docsRootDir,
      localIntelRootDir: intelRootDir,
      localMusicRootDir: musicRootDir,
    });

    await expect(provider.getAppStatus()).resolves.toMatchObject({ status: "ready" });
    await expect(provider.getSettingsSummary()).resolves.toMatchObject({ total: 7 });
    await expect(provider.listTasks()).resolves.toEqual(expect.any(Array));
    await expect(provider.listKnowledgeSources()).resolves.toEqual([
      expect.objectContaining({ sourceId: "knowledge-base", status: "ready" }),
    ]);
    await expect(provider.listKnowledgeDocuments()).resolves.toEqual([
      expect.objectContaining({ relativePath: "README.md", source: "local" }),
    ]);
    await expect(provider.getKnowledgeIndexStatus()).resolves.toMatchObject({ docs: 1 });
    await expect(provider.searchKnowledgeLocal("Docs")).resolves.toMatchObject({
      results: [expect.objectContaining({ relativePath: "README.md" })],
    });
    const [knowledgeDocument] = await provider.listKnowledgeDocuments();
    await expect(provider.getKnowledgeDocumentPreview(knowledgeDocument.id)).resolves.toMatchObject({
      relativePath: "README.md",
      source: "local",
    });
    await expect(provider.listCodeRepositories()).resolves.toEqual([
      expect.objectContaining({ repoId: "local-root", name: "repo" }),
    ]);
    await expect(provider.getCodeGitSummary()).resolves.toMatchObject({ branch: "main" });
    await expect(provider.listCodeRepositoryFiles()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "src/index.js", source: "local" }),
    ]));
    await expect(provider.getCodeRepositoryMetrics()).resolves.toMatchObject({
      fileCount: 1,
      modules: 1,
    });
    await expect(provider.getCodeRepositoryStructure()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "src" }),
    ]));
    await expect(provider.listAgents()).resolves.toEqual([
      expect.objectContaining({ name: "Reader", state: "online" }),
    ]);
    await expect(provider.listAgentSessions()).resolves.toEqual([
      expect.objectContaining({ sessionId: "local-session", messageCount: 1 }),
    ]);
    await expect(provider.getIntelServiceStatus()).resolves.toMatchObject({
      databaseReady: true,
      workspaceConfigured: true,
    });
    await expect(provider.getIntelDashboardSummary()).resolves.toMatchObject({ reportCount: 1 });
    await expect(provider.getIntelSourceHealth()).resolves.toEqual(expect.any(Array));
    await expect(provider.listIntelReports()).resolves.toEqual([
      expect.objectContaining({ relativePath: "reports/2026-06-01.md", reportId: "2026-06-01" }),
    ]);
    await expect(provider.listIntelLogs()).resolves.toEqual([
      expect.objectContaining({ level: "warn", message: "token=[redacted] trimmed" }),
    ]);
    await expect(provider.getMusicPlaybackState()).resolves.toMatchObject({
      state: "idle",
      trackCount: 1,
    });
  });
});
