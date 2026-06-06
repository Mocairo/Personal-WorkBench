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

  it("sends phase-9 Agent Chat text through LLM provider with automatic Knowledge search", async () => {
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
    const provider = createMainDataProvider({
      llmClient,
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
          permission: "Level 1 / read-only",
          state: "completed",
          title: "Knowledge Search",
          toolId: "kb.searchLocal",
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
    });

    await expect(provider.sendAgentChatMessage({ userText: "Hello" })).resolves.toMatchObject({
      assistantMessage: {
        role: "assistant",
        status: "error",
      },
      error: {
        code: "LLM_SECRET_MISSING",
        message: "LLM provider secret is not configured.",
      },
      status: "error",
      toolResultsSummary: [
        expect.objectContaining({ toolId: "kb.searchLocal" }),
      ],
    });
  });

  it("streams phase-10 Agent Chat replies, persists the session in userData and runs automatic Knowledge search", async () => {
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
    const provider = createMainDataProvider({
      llmStreamClient,
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
          permission: "Level 1 / read-only",
          title: "Knowledge Search",
          toolId: "kb.searchLocal",
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
      toolPolicy: {
        autoAllowKnowledgeSearch: false,
      },
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

  it("passes recent persisted Agent Chat history through the Context Builder into LLM messages", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-context-user-data-"));
    const persistedPath = path.join(userDataDir, "sessions", "agent-chat-session.json");
    await fs.mkdir(path.dirname(persistedPath), { recursive: true });
    await fs.writeFile(
      persistedPath,
      JSON.stringify({
        chatMessages: [
          { role: "user", text: "Old message token=sk-old-secret D:\\private\\old.txt" },
          { role: "assistant", text: "Old answer" },
          { role: "user", text: "Settings must stay as a floating overlay." },
          { role: "assistant", text: "I will keep Settings as a floating overlay." },
        ],
        contextItems: [
          { title: "Session note", type: "session", summary: "Page Switcher has 8 cards." },
        ],
        session: { id: "session-context", title: "Context session" },
      }),
    );
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        text: "Memory-aware answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      agentChatContextLimits: {
        maxChars: 4000,
        maxItems: 6,
        maxMessages: 2,
      },
      llmClient,
      userDataDir,
    });

    const result = await provider.sendAgentChatMessage({
      sessionId: "session-context",
      userText: "Use the remembered UI constraints.",
    });

    const messages = llmClient.mock.calls[0][0].messages;
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "Settings must stay as a floating overlay.", role: "user" }),
      expect.objectContaining({ content: "I will keep Settings as a floating overlay.", role: "assistant" }),
      expect.objectContaining({ content: "Use the remembered UI constraints.", role: "user" }),
    ]));
    expect(messages.at(-1)).toEqual({
      content: "Use the remembered UI constraints.",
      role: "user",
    });
    expect(result.contextSummary).toMatchObject({
      usedHistoryCount: 2,
      usedContextItems: expect.arrayContaining([
        expect.objectContaining({ sourceType: "session", title: "Session note" }),
      ]),
    });
    expect(JSON.stringify({ messages, result })).not.toMatch(/sk-old-secret|token=|D:\\private|apiKey|Authorization/i);
  });

  it("keeps the current user message when context budget trims old session history", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-context-budget-"));
    const persistedPath = path.join(userDataDir, "sessions", "agent-chat-session.json");
    await fs.mkdir(path.dirname(persistedPath), { recursive: true });
    await fs.writeFile(
      persistedPath,
      JSON.stringify({
        chatMessages: [
          { role: "user", text: "Old long history A".repeat(20) },
          { role: "assistant", text: "Old long history B".repeat(20) },
          { role: "user", text: "Recent memory" },
          { role: "assistant", text: "Recent answer" },
        ],
      }),
    );
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        text: "Budgeted answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      agentChatContextLimits: {
        maxChars: 240,
        maxItems: 1,
        maxMessages: 4,
      },
      llmClient,
      userDataDir,
    });

    const result = await provider.sendAgentChatMessage({
      userText: "CURRENT MESSAGE MUST STAY",
    });

    const messages = llmClient.mock.calls[0][0].messages;
    expect(messages.at(-1)).toEqual({
      content: "CURRENT MESSAGE MUST STAY",
      role: "user",
    });
    expect(result.contextSummary.trimmed.history).toBeGreaterThan(0);
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
    expect(JSON.stringify(llmClient.mock.calls[0][0].messages)).toContain("Tool Result Summaries");
    expect(result.contextSummary).toMatchObject({
      usedToolResults: [
        expect.objectContaining({ sourceType: "tool", toolId: "kb.searchLocal" }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-tool-hidden|apiKey|token=|secret=|Authorization/i);
  });

  it("keeps ambient preview context out of the real Agent Chat LLM prompt", async () => {
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: "Focused answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      llmClient,
    });

    const result = await provider.sendAgentChatMessage({
      userText: "我的论文模板里都有什么",
    });

    const llmInput = llmClient.mock.calls[0][0];
    const promptText = JSON.stringify(llmInput.messages);
    expect(result.contextSummary.usedContextItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Repository" }),
      expect.objectContaining({ sourceType: "intel" }),
    ]));
    expect(promptText).not.toContain("Repository");
    expect(promptText).not.toContain("Local Intel");
    expect(promptText).toContain("Tool Result Summaries");
  });

  it("does not expose raw model-emitted tool_call markup as the assistant answer", async () => {
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: "<tool_call> <function=kb.searchLocal> <parameter=query>论文阅读模板</parameter> </function> </tool_call>",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      llmClient,
    });

    const result = await provider.sendAgentChatMessage({
      userText: "需要",
    });

    expect(result.assistantMessage.text).not.toContain("<tool_call>");
    expect(result.assistantMessage.text).not.toContain("<function=");
    expect(result.assistantMessage.text).toContain("知识库");
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
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-tool-llm-error-user-data-"));
    const llmClient = vi.fn(async () => ({
      error: {
        code: "LLM_REQUEST_FAILED",
        message: "LLM request failed token=sk-error-secret",
        retryable: true,
      },
      ok: false,
    }));
    const provider = createMainDataProvider({ llmClient, userDataDir });

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
      contextSummary: {
        usedToolResults: [
          expect.objectContaining({ sourceType: "tool", toolId: "kb.searchLocal" }),
        ],
      },
      status: "error",
      toolResultsSummary: [
        expect.objectContaining({ status: "completed", toolId: "kb.searchLocal" }),
      ],
    });
    expect(JSON.stringify(llmClient.mock.calls[0][0].messages)).toContain("Tool Result Summaries");
    expect(JSON.stringify(result)).not.toMatch(/sk-error-secret|token=/);

    const persistedPath = path.join(userDataDir, "sessions", "agent-chat-session.json");
    const persisted = await fs.readFile(persistedPath, "utf8");
    const parsed = JSON.parse(persisted);
    expect(parsed).toMatchObject({
      contextSummary: {
        usedToolResults: [
          expect.objectContaining({ sourceType: "tool", toolId: "kb.searchLocal" }),
        ],
      },
      toolResultsSummary: [
        expect.objectContaining({ toolId: "kb.searchLocal" }),
      ],
    });
    expect(persisted).not.toMatch(/sk-error-secret|token=|apiKey|Authorization|requestHeaders/i);
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

  it("reindexes the configured Knowledge Base into userData and searches indexed chunks", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-index-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "guide.md"), "# Guide\n\nIndexed needle with apiKey=sk-main-kb-secret D:\\private\\vault\\guide.md\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const embedTexts = vi.fn(async (texts) => ({
      ok: true,
      data: {
        embeddings: texts.map((text) => (text.includes("needle") ? [1, 0] : [0, 1])),
        metadata: { model: "fake-embedding", provider: "fake" },
        providerStatus: "ready",
      },
    }));
    const provider = createMainDataProvider({
      embedTexts,
      embeddingConfig: { model: "fake-embedding", provider: "fake" },
      localSourcesConfigPath,
      userDataDir,
    });

    const reindex = await provider.startKnowledgeIndex();

    expect(reindex).toMatchObject({
      embeddingSummary: {
        embedded: expect.any(Number),
        failed: 0,
        model: "fake-embedding",
        provider: "fake",
        providerStatus: "ready",
      },
      source: "knowledge-index",
      status: "ready",
      summary: {
        docs: 1,
        indexed: 1,
        scanned: 1,
        embedding: {
          embedded: expect.any(Number),
          failed: 0,
          providerStatus: "ready",
        },
      },
    });
    expect(embedTexts).toHaveBeenCalled();
    expect(JSON.stringify(reindex)).not.toContain(docsRootDir);
    expect(JSON.stringify(reindex)).not.toContain(userDataDir);

    await expect(provider.getKnowledgeBase()).resolves.toMatchObject({
      indexStats: {
        docs: 1,
        embedding: {
          embedded: expect.any(Number),
          providerStatus: "ready",
        },
        source: "knowledge-index",
        status: "ready",
      },
      knowledgeDocuments: [
        expect.objectContaining({
          relativePath: "guide.md",
          source: "knowledge-index",
        }),
      ],
    });
    await expect(provider.searchKnowledgeLocal("needle")).resolves.toMatchObject({
      matchMode: "hybrid",
      results: [
        expect.objectContaining({
          chunkId: expect.any(String),
          matchType: "hybrid",
          preview: expect.stringContaining("needle"),
          relativePath: "guide.md",
          vectorScore: expect.any(Number),
          source: "knowledge-index",
        }),
      ],
      semanticStatus: "ready",
      source: "knowledge-index",
      status: "ready",
    });

    const indexJson = await fs.readFile(path.join(userDataDir, "knowledge", "knowledge-index.json"), "utf8");
    expect(indexJson).not.toMatch(/sk-main-kb-secret|apiKey=|D:\\private/);
    await expect(fs.access(path.join(docsRootDir, "knowledge", "knowledge-index.json"))).rejects.toThrow();
  });

  it("routes local bge-m3 embeddings through main/provider options for semantic Knowledge search", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-local-bge-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const modelPath = path.join(rootDir, "models", "bge-m3");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.mkdir(modelPath, { recursive: true });
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    await fs.writeFile(path.join(docsRootDir, "space.md"), "# Space\n\nApollo launch guidance.\n");
    await fs.writeFile(path.join(docsRootDir, "garden.md"), "# Garden\n\nTomato planting guidance.\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const embeddingRuntimeClient = vi.fn(async (request) => ({
      dimension: 2,
      elapsed: 3,
      embeddings: request.texts.map((text) => (text.includes("Space") || text.includes("orbital") ? [1, 0] : [0, 1])),
      model: "bge-m3",
      ok: true,
    }));
    const provider = createMainDataProvider({
      embeddingConfig: { modelPath, provider: "local-bge-m3" },
      embeddingRuntimeClient,
      localSourcesConfigPath,
      userDataDir,
    });

    const reindex = await provider.startKnowledgeIndex();
    const search = await provider.searchKnowledgeLocal("orbital");

    expect(reindex).toMatchObject({
      embeddingSummary: {
        embedded: 2,
        failed: 0,
        model: "bge-m3",
        provider: "local-bge-m3",
        providerStatus: "ready",
      },
    });
    expect(search).toMatchObject({
      matchMode: "semantic",
      results: [
        expect.objectContaining({
          matchType: "semantic",
          relativePath: "space.md",
        }),
      ],
      semanticStatus: "ready",
    });
    expect(embeddingRuntimeClient).toHaveBeenCalled();
    expect(JSON.stringify({ reindex, search })).not.toContain(modelPath);
  });

  it("attaches indexed Knowledge contexts to Agent Chat userData and exposes sanitized session state", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-attach-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "attach.md"), "# Attach\n\nAttachable context apiKey=sk-kb-attach-secret D:\\private\\vault\\attach.md\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        text: "Attached context answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      llmClient,
      localSourcesConfigPath,
      userDataDir,
    });
    await provider.startKnowledgeIndex();
    const [document] = await provider.listKnowledgeDocuments();

    const attach = await provider.attachKnowledgeContextToAgentChat({
      documentId: document.id,
      preview: "renderer supplied secret token=sk-renderer-secret",
      relativePath: "D:\\private\\renderer\\bad.md",
      sessionId: "local-session",
    });

    expect(attach).toMatchObject({
      attachedKnowledgeContexts: [
        expect.objectContaining({
          documentId: document.id,
          relativePath: "attach.md",
          sourceType: "knowledge",
          title: "attach.md",
        }),
      ],
      sessionId: "local-session",
      status: "saved",
    });
    expect(JSON.stringify(attach)).not.toMatch(/sk-kb-attach-secret|sk-renderer-secret|apiKey|token=|D:\\private/);

    await expect(provider.listAgentChatKnowledgeContexts({ sessionId: "local-session" })).resolves.toMatchObject({
      attachedKnowledgeContexts: [expect.objectContaining({ documentId: document.id })],
      total: 1,
    });
    await expect(provider.getAgentChat()).resolves.toMatchObject({
      attachedKnowledgeContexts: [expect.objectContaining({ documentId: document.id, title: "attach.md" })],
    });
    const chatResult = await provider.sendAgentChatMessage({
      sessionId: "local-session",
      toolPolicy: { autoAllowLevel1ReadOnly: true },
      userText: "Use the attached knowledge context.",
    });
    expect(chatResult).toMatchObject({
      status: "ready",
    });
    expect(chatResult.contextSummary.usedContextItems[0]).toMatchObject({
      sourceType: "knowledge",
      status: "attached",
      title: "attach.md",
    });
    expect(JSON.stringify(llmClient.mock.calls[0][0].messages)).toContain("attach.md");
    const sessionJson = await fs.readFile(path.join(userDataDir, "sessions", "agent-chat-session.json"), "utf8");
    expect(sessionJson).toContain('"status": "attached"');
    expect(sessionJson).toContain("attach.md");
    expect(sessionJson).not.toMatch(/sk-kb-attach-secret|sk-renderer-secret|apiKey|token=|D:\\private/);

    const storeJson = await fs.readFile(path.join(userDataDir, "sessions", "agent-chat-knowledge-contexts.json"), "utf8");
    expect(storeJson).not.toMatch(/sk-kb-attach-secret|sk-renderer-secret|apiKey|token=|D:\\private/);
    await expect(fs.access(path.join(docsRootDir, "sessions", "agent-chat-knowledge-contexts.json"))).rejects.toThrow();

    await provider.removeKnowledgeContextFromAgentChat({
      contextId: attach.attachedKnowledgeContexts[0].contextId,
      sessionId: "local-session",
    });
    await expect(provider.listAgentChatKnowledgeContexts({ sessionId: "local-session" })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      total: 0,
    });
    await provider.attachKnowledgeContextToAgentChat({
      documentId: document.id,
      sessionId: "local-session",
    });
    await provider.clearAgentChatKnowledgeContexts({ sessionId: "local-session" });
    await expect(provider.listAgentChatKnowledgeContexts({ sessionId: "local-session" })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      total: 0,
    });
  });

  it("feeds indexed kb.searchLocal tool summaries into Agent Chat Context Builder", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-agent-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "rag.md"), "# RAG\n\nContext Builder should cite indexed needle chunks.\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: "Indexed answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      agentChatContextLimits: {
        maxChars: 4000,
        maxItems: 6,
        maxMessages: 2,
      },
      llmClient,
      localSourcesConfigPath,
      userDataDir,
    });
    await provider.startKnowledgeIndex();

    const result = await provider.sendAgentChatMessage({
      toolPolicy: { autoAllowLevel1ReadOnly: true },
      userText: "search docs for indexed needle",
    });

    expect(result).toMatchObject({
      assistantMessage: {
        metadata: {
          citations: [
            expect.objectContaining({
              relativePath: "rag.md",
              sourceRefId: "S1",
              sourceType: "knowledge",
            }),
          ],
        },
      },
      contextSummary: {
        sourceRefs: [
          expect.objectContaining({
            relativePath: "rag.md",
            sourceRefId: "S1",
            sourceType: "knowledge",
          }),
        ],
        usedToolResults: [
          expect.objectContaining({ sourceType: "tool", toolId: "kb.searchLocal" }),
        ],
      },
      status: "ready",
      toolResultsSummary: [
        expect.objectContaining({
          summary: expect.stringContaining("Knowledge Search"),
          toolId: "kb.searchLocal",
        }),
      ],
    });
    const llmInput = llmClient.mock.calls[0][0];
    expect(JSON.stringify(llmInput.messages)).toContain("Source References");
    expect(JSON.stringify(llmInput.messages)).toContain("[S1]");
    expect(JSON.stringify(llmInput.messages)).toContain("Tool Result Summaries");
    expect(JSON.stringify(llmInput.messages)).toContain("rag.md");
    expect(JSON.stringify({ llmInput, result })).not.toMatch(/D:\\|sk-|apiKey|Authorization/);
  });

  it("automatically searches indexed Knowledge for ordinary Agent Chat questions", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-auto-agent-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "daily.md"), "# Daily\n\nNeedle phrase appears in local diary notes.\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const llmClient = vi.fn(async () => ({
      data: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        text: "Auto searched answer.",
      },
      ok: true,
    }));
    const provider = createMainDataProvider({
      llmClient,
      localSourcesConfigPath,
      userDataDir,
    });
    await provider.startKnowledgeIndex();

    const result = await provider.sendAgentChatMessage({
      userText: "Needle phrase 最近在什么日记里出现？",
    });

    expect(result).toMatchObject({
      status: "ready",
      toolCalls: [
        expect.objectContaining({
          state: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
      toolResultsSummary: [
        expect.objectContaining({
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(llmClient).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(llmClient.mock.calls[0][0].messages)).toContain("Tool Result Summaries");
    expect(JSON.stringify(llmClient.mock.calls[0][0].messages)).toContain("daily.md");
    expect(JSON.stringify({ result })).not.toMatch(/D:\\|sk-|apiKey|Authorization/);
  });

  it("resets Agent Chat userData session and attached Knowledge contexts for New Chat", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-chat-reset-"));
    const docsRootDir = path.join(rootDir, "docs");
    const localSourcesConfigPath = path.join(rootDir, "config", "local-sources.json");
    const userDataDir = path.join(rootDir, "user-data");
    await fs.mkdir(docsRootDir, { recursive: true });
    await fs.mkdir(path.dirname(localSourcesConfigPath), { recursive: true });
    await fs.writeFile(path.join(docsRootDir, "reset.md"), "# Reset\n\nContext to clear.\n");
    await fs.writeFile(
      localSourcesConfigPath,
      JSON.stringify({
        paths: {
          knowledgeBasePath: docsRootDir,
        },
      }),
    );
    const provider = createMainDataProvider({
      llmClient: vi.fn(async () => ({
        data: {
          metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
          role: "assistant",
          text: "Old answer.",
        },
        ok: true,
      })),
      localSourcesConfigPath,
      userDataDir,
    });
    await provider.startKnowledgeIndex();
    const [document] = await provider.listKnowledgeDocuments();
    await provider.attachKnowledgeContextToAgentChat({ documentId: document.id });
    await provider.sendAgentChatMessage({ userText: "Use reset context" });

    const reset = await provider.resetAgentChatSession();

    expect(reset).toMatchObject({
      attachedKnowledgeContexts: [],
      chatMessages: [],
      contextItems: [],
      session: {
        messageCount: 0,
        source: "userData",
        status: "ready",
      },
      status: "reset",
      toolCalls: [],
    });
    await expect(provider.getAgentChat()).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      chatMessages: [],
      session: {
        messageCount: 0,
      },
    });
    const sessionJson = await fs.readFile(path.join(userDataDir, "sessions", "agent-chat-session.json"), "utf8");
    expect(sessionJson).not.toMatch(/Old answer|Use reset context|sk-|apiKey|token=|Authorization/);
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

  it("exposes a safe Knowledge file tree and object preview through the configured root", async () => {
    const docsRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-tree-"));
    await fs.mkdir(path.join(docsRootDir, "notes"), { recursive: true });
    await fs.mkdir(path.join(docsRootDir, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(docsRootDir, "reader.md"),
      "# Reader\n\nTree preview apiKey=sk-main-tree-secret D:\\private\\kb\\reader.md\n",
    );
    await fs.writeFile(path.join(docsRootDir, "notes", "daily.txt"), "Daily note\n");
    await fs.writeFile(path.join(docsRootDir, ".git", "secret.md"), "# secret\n");
    const provider = createMainDataProvider({
      knowledgeBaseRootDir: docsRootDir,
      userDataDir: await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-tree-user-data-")),
    });

    const tree = await provider.listKnowledgeFileTree();

    expect(tree).toMatchObject({
      root: {
        children: expect.arrayContaining([
          expect.objectContaining({ name: "reader.md", readable: true, relativePath: "reader.md", type: "file" }),
          expect.objectContaining({ name: "notes", relativePath: "notes", type: "folder" }),
        ]),
        relativePath: "",
      },
      source: "local",
      status: "ready",
    });
    expect(JSON.stringify(tree)).not.toMatch(/sk-main-tree-secret|apiKey|D:\\private/);
    expect(JSON.stringify(tree)).not.toContain(docsRootDir);

    await expect(provider.getKnowledgeDocumentPreview({
      maxContentChars: 120,
      relativePath: "reader.md",
    })).resolves.toMatchObject({
      content: expect.stringContaining("# Reader"),
      readable: true,
      relativePath: "reader.md",
      status: "ready",
    });
  });

  it("attaches sanitized selected Knowledge text even when it is not in the persisted index", async () => {
    const docsRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-selection-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "main-provider-kb-selection-user-data-"));
    await fs.writeFile(path.join(docsRootDir, "reader.md"), "# Reader\n\nSelection source.\n");
    const provider = createMainDataProvider({
      knowledgeBaseRootDir: docsRootDir,
      userDataDir,
    });

    const result = await provider.attachKnowledgeContextToAgentChat({
      contextId: "selection:reader.md:0",
      matchType: "selection",
      preview: `Selected text apiKey=sk-selected-secret Authorization: Bearer hidden ${"x".repeat(700)}`,
      relativePath: "D:\\private\\vault\\reader.md",
      sessionId: "local-session",
      sourceType: "knowledge",
      title: "Reader token=sk-title-secret",
    });

    expect(result).toMatchObject({
      attachedKnowledgeContexts: [
        expect.objectContaining({
          contextId: "selection:reader.md:0",
          matchType: "selection",
          preview: expect.stringContaining("Selected text"),
          sourceType: "knowledge",
        }),
      ],
      status: "saved",
    });
    expect(result.attachedKnowledgeContexts[0].preview.length).toBeLessThanOrEqual(480);
    expect(JSON.stringify(result)).not.toMatch(/sk-selected-secret|sk-title-secret|apiKey|Authorization|Bearer hidden|D:\\private/);

    const storeJson = await fs.readFile(path.join(userDataDir, "sessions", "agent-chat-knowledge-contexts.json"), "utf8");
    expect(storeJson).not.toMatch(/sk-selected-secret|sk-title-secret|apiKey|Authorization|Bearer hidden|D:\\private/);
    await expect(fs.access(path.join(docsRootDir, "sessions", "agent-chat-knowledge-contexts.json"))).rejects.toThrow();
  });
});
