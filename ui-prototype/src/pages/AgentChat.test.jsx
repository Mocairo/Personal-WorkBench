import { describe, expect, it } from "vitest";
import {
  getChatStatusSummary,
  getComposerSendState,
  getContextRows,
  getMessageCitationChips,
  getRecentSessionRows,
  getTimelineRows,
  getToolApprovalState,
  mergeDryRunResultIntoChatData,
  mergeAttachedKnowledgeContextResultIntoChatData,
  mergeResetAgentChatResultIntoChatData,
  mergeSendErrorIntoChatData,
  mergeStreamEventIntoChatData,
  mergeStreamResultIntoChatData,
  mergeStreamStartIntoChatData,
  mergeTextSendResultIntoChatData,
  parseMarkdownBlocks,
} from "./AgentChat";

describe("AgentChat page data binding helpers", () => {
  it("parses assistant markdown into display blocks instead of raw symbols", () => {
    const blocks = parseMarkdownBlocks([
      "### **核心定位**",
      "Transformers 是 **预训练模型** 的工具箱。",
      "- **模型**: BERT、GPT",
      "- `pipeline`: 一行代码完成任务",
      "```python",
      "print('hello')",
      "```",
    ].join("\n"));

    expect(blocks).toEqual([
      {
        children: [{ text: "核心定位", type: "strong" }],
        level: 3,
        type: "heading",
      },
      {
        children: [
          { text: "Transformers 是 ", type: "text" },
          { text: "预训练模型", type: "strong" },
          { text: " 的工具箱。", type: "text" },
        ],
        type: "paragraph",
      },
      {
        items: [
          [
            { text: "模型", type: "strong" },
            { text: ": BERT、GPT", type: "text" },
          ],
          [
            { text: "pipeline", type: "code" },
            { text: ": 一行代码完成任务", type: "text" },
          ],
        ],
        ordered: false,
        type: "list",
      },
      {
        language: "python",
        text: "print('hello')",
        type: "code",
      },
    ]);
  });

  it("hides ordinary context pack items from the left panel", () => {
    const rows = getContextRows([
      {
        chunks: 8,
        title: "docs/agent.md",
        tokens: "2.4k",
        type: "doc",
        updatedAt: "2026-06-03T10:00:00.000Z",
      },
    ]);

    expect(rows).toEqual([]);
  });

  it("does not render ordinary context pack items as fixed left-panel blocks", () => {
    const rows = getContextRows([
      {
        chunks: 8,
        title: "Ambient doc from context pack",
        tokens: "2.4k",
        type: "doc",
      },
      {
        title: "Selected agent",
        type: "agent",
      },
    ]);

    expect(rows).toEqual([]);
  });

  it("adds compact context summary rows without exposing individual source filenames", () => {
    const rows = getContextRows(
      [],
      {
        sourceRefs: [
          {
            matchType: "hybrid",
            preview: "Preview apiKey=sk-context-row",
            relativePath: "D:\\private\\vault\\doc.md",
            sourceRefId: "S1",
            sourceType: "knowledge",
            title: "Doc Source token=sk-title-row",
          },
        ],
        trimmed: {
          contextItems: 1,
          history: 2,
          toolResults: 0,
        },
        usedContextItems: [
          {
            sourceType: "session",
            status: "used",
            title: "Session context token=sk-session-context",
          },
          {
            sourceType: "knowledge",
            status: "used",
            title: "D:\\private\\kb\\doc.md apiKey=sk-context-title",
          },
        ],
        usedHistoryCount: 2,
        usedToolResults: [
          {
            label: "Knowledge Search token=sk-tool-label",
            sourceType: "tool",
            status: "completed",
            toolId: "kb.searchLocal",
          },
        ],
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        active: true,
        title: "Session memory",
        type: "session",
      }),
      expect.objectContaining({
        title: "Session context",
        type: "session",
      }),
      expect.objectContaining({
        title: "Referenced sources",
        type: "knowledge",
      }),
      expect.objectContaining({
        title: "Tool results used",
        type: "tool",
      }),
      expect.objectContaining({
        title: "Budget trimmed",
        type: "audit",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Doc Source|sk-|apiKey|token=|D:\\private|Authorization/i);
  });

  it("summarizes source refs in the context panel instead of listing every file", () => {
    const rows = getContextRows(
      [],
      {
        sourceRefs: [
          {
            matchType: "hybrid",
            preview: "Preview apiKey=sk-context-row",
            relativePath: "D:\\private\\vault\\doc.md",
            sourceRefId: "S1",
            sourceType: "knowledge",
            title: "Doc Source token=sk-title-row",
          },
        ],
        usedContextItems: [],
        usedHistoryCount: 0,
        usedToolResults: [],
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        chunks: 1,
        title: "Referenced sources",
        tokens: "hybrid",
        type: "knowledge",
        updated: "current run",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Doc Source|sk-context-row|sk-title-row|apiKey|token=|D:\\private/i);
  });

  it("builds sanitized recent chat rows for history restore", () => {
    const rows = getRecentSessionRows([
      {
        lastUpdated: "2026-06-05T10:00:00.000Z",
        messageCount: 4,
        preview: "Old answer token=sk-history-preview",
        sessionId: "history-1",
        title: "D:\\private\\vault\\论文模板.md apiKey=sk-history-title",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        messageCount: 4,
        preview: "Old answer [redacted]",
        sessionId: "history-1",
        title: "[redacted-path] [redacted]",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/sk-history|apiKey|token=|D:\\private/i);
  });

  it("builds assistant citation chips from sanitized message metadata", () => {
    const chips = getMessageCitationChips({
      metadata: {
        citations: [
          {
            matchType: "hybrid",
            preview: "Preview token=sk-chip-secret",
            relativePath: "D:\\private\\vault\\doc.md",
            sourceRefId: "S1",
            sourceType: "knowledge",
            title: "Doc Source apiKey=sk-chip-title",
          },
        ],
      },
      role: "assistant",
      text: "Grounded answer.",
    });

    expect(chips).toEqual([
      expect.objectContaining({
        label: "S1",
        matchType: "hybrid",
        preview: "Preview [redacted]",
        title: "Doc Source [redacted]",
        updated: "[redacted-path]",
      }),
    ]);
    expect(JSON.stringify(chips)).not.toMatch(/sk-chip|apiKey|token=|D:\\private/i);
  });

  it("shows attached knowledge contexts before ordinary context rows", () => {
    const rows = getContextRows(
      [
        {
          chunks: 2,
          title: "Ordinary context",
          type: "session",
        },
      ],
      null,
      [
        {
          contextId: "doc-1:chunk-1",
          matchType: "hybrid",
          preview: "Pinned apiKey=sk-attached-preview",
          relativePath: "D:\\private\\vault\\doc.md",
          score: 9.5,
          sourceType: "knowledge",
          title: "Pinned KB token=sk-attached-title",
        },
      ],
    );

    expect(rows[0]).toMatchObject({
      attached: true,
      contextId: "doc-1:chunk-1",
      title: "Pinned KB [redacted]",
      tokens: "hybrid / 9.5",
      type: "knowledge",
      updated: "[redacted-path]",
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/sk-attached|apiKey|token=|D:\\private/);
  });

  it("updates attached knowledge contexts after remove or clear results", () => {
    const updated = mergeAttachedKnowledgeContextResultIntoChatData(
      {
        attachedKnowledgeContextCount: 1,
        attachedKnowledgeContexts: [{ contextId: "old", title: "Old" }],
        chatMessages: [],
        contextItems: [],
        toolCalls: [],
      },
      {
        attachedKnowledgeContexts: [{ contextId: "new", title: "New" }],
        total: 1,
      },
    );

    expect(updated).toMatchObject({
      attachedKnowledgeContextCount: 1,
      attachedKnowledgeContexts: [{ contextId: "new", title: "New" }],
    });
  });

  it("replaces visible state with an empty Agent Chat session after reset", () => {
    const updated = mergeResetAgentChatResultIntoChatData(
      {
        attachedKnowledgeContexts: [{ contextId: "old", title: "Old" }],
        chatMessages: [{ role: "assistant", text: "Old answer" }],
        contextItems: [{ title: "Old context" }],
        toolCalls: [{ title: "Old tool" }],
      },
      {
        attachedKnowledgeContexts: [],
        chatMessages: [],
        contextItems: [],
        session: { messageCount: 0, status: "ready" },
        status: "reset",
        toolCalls: [],
      },
    );

    expect(updated).toMatchObject({
      attachedKnowledgeContexts: [],
      chatMessages: [],
      contextItems: [],
      session: { messageCount: 0 },
      toolCalls: [],
    });
  });

  it("keeps tool-call duration and permission details from local sessions", () => {
    const rows = getTimelineRows([
      {
        duration: "320ms",
        meta: "docs/agent.md",
        permission: "read allowed",
        state: "done",
        title: "Read config",
      },
    ]);

    expect(rows[0]).toMatchObject({
      duration: "320ms",
      meta: "docs/agent.md",
      permission: "read allowed",
      state: "done",
      title: "Read config",
    });
  });

  it("identifies pending Level 1 tools without allowing denied elevated tools", () => {
    expect(
      getToolApprovalState([
        { permissionLevel: 1, state: "pending", title: "Knowledge Search", toolId: "kb.searchLocal" },
        { permissionLevel: 4, state: "denied", title: "Shell Command", toolId: "shell.exec" },
      ]),
    ).toEqual({
      canApproveAllLevel1: true,
      hasPendingLevel1: true,
      pendingLevel1ToolIds: ["kb.searchLocal"],
    });
  });

  it("summarizes LLM provider and permission state and enables send only when ready with a secret", () => {
    expect(
      getChatStatusSummary({
        llmProviderStatus: {
          hasSecret: true,
          label: "OpenAI",
          model: "gpt-4.1-mini",
          status: "ready",
        },
        permissionSummary: {
          requiresApproval: true,
          status: "pending",
        },
      }),
    ).toEqual({
      modelLabel: "gpt-4.1-mini",
      permissionLabel: "permission pending",
      providerLabel: "OpenAI",
      providerStatus: "ready",
      sendEnabled: true,
    });
    expect(
      getChatStatusSummary({
        llmProviderStatus: {
          hasSecret: false,
          label: "OpenAI",
          model: "gpt-4.1-mini",
          status: "missing_secret",
        },
      }),
    ).toMatchObject({
      providerStatus: "missing_secret",
      sendEnabled: false,
    });
  });

  it("enables dry-run for text and real send only when provider can send", () => {
    expect(getComposerSendState("", true)).toEqual({
      dryRunEnabled: false,
      realSendEnabled: false,
    });
    expect(getComposerSendState("Summarize workspace", false)).toEqual({
      dryRunEnabled: true,
      realSendEnabled: false,
    });
    expect(getComposerSendState("Summarize workspace", true)).toEqual({
      dryRunEnabled: true,
      realSendEnabled: true,
    });
  });

  it("merges dry-run results into chat, context and timeline data", () => {
    const merged = mergeDryRunResultIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        contextPack: {
          items: [{ title: "KB Doc", type: "kb" }],
        },
        draft: {
          id: "draft-1",
          userText: "Summarize workspace",
        },
        mockResponse: {
          id: "mock-1",
          text: "Dry-run preview only.",
        },
        toolPlan: {
          items: [{ decision: "requiresApproval", permissionLevel: 2, title: "Write note", toolId: "notes.write" }],
        },
      },
    );

    expect(merged.chatMessages).toEqual([
      expect.objectContaining({ role: "user", text: "Summarize workspace" }),
      expect.objectContaining({ role: "assistant", text: "Dry-run preview only." }),
    ]);
    expect(merged.contextItems).toEqual([expect.objectContaining({ title: "KB Doc", type: "kb" })]);
    expect(merged.toolCalls).toEqual([
      expect.objectContaining({
        permission: "Level 2 / requiresApproval",
        state: "permission_required",
        title: "Write note",
      }),
    ]);
  });

  it("merges real text replies without recording tool execution", () => {
    const merged = mergeTextSendResultIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        assistantMessage: {
          id: "assistant-1",
          metadata: { provider: "openai", toolCalls: 0 },
          role: "assistant",
          source: "llm",
          text: "Live answer.",
        },
        contextPack: {
          items: [{ sourceType: "kb", title: "Docs", type: "kb" }],
        },
        toolCalls: [
          {
            duration: "0ms",
            permission: "none",
            state: "done",
            title: "No tools executed",
          },
        ],
        userMessage: {
          id: "user-1",
          role: "user",
          text: "Hello",
        },
      },
    );

    expect(merged.chatMessages).toEqual([
      expect.objectContaining({ role: "user", text: "Hello" }),
      expect.objectContaining({ role: "assistant", source: "llm", text: "Live answer." }),
    ]);
    expect(merged.contextItems).toEqual([expect.objectContaining({ title: "Docs", type: "kb" })]);
    expect(merged.toolCalls).toEqual([
      expect.objectContaining({
        permission: "none",
        state: "done",
        title: "No tools executed",
      }),
    ]);
    expect(JSON.stringify(merged)).not.toMatch(/apiKey|sk-/);
  });

  it("keeps chat state stable when real send returns an ApiResult error", () => {
    const merged = mergeSendErrorIntoChatData(
      { chatMessages: [{ role: "assistant", text: "Existing" }], contextItems: [], toolCalls: [] },
      {
        code: "LLM_SECRET_MISSING",
        message: "LLM provider secret is not configured.",
      },
    );

    expect(merged).toMatchObject({
      chatMessages: [{ role: "assistant", text: "Existing" }],
      sendError: {
        code: "LLM_SECRET_MISSING",
        message: "LLM provider secret is not configured.",
      },
      toolCalls: [
        expect.objectContaining({
          permission: "none",
          title: "No tools executed",
        }),
      ],
    });
  });

  it("starts a streaming reply with a user message, assistant placeholder and no tool execution", () => {
    const merged = mergeStreamStartIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        requestId: "stream-1",
        userMessage: {
          id: "user-1",
          role: "user",
          text: "Hello",
        },
      },
    );

    expect(merged.chatMessages).toEqual([
      expect.objectContaining({ id: "user-1", role: "user", status: "sent", text: "Hello" }),
      expect.objectContaining({ id: "assistant-stream-1", role: "assistant", status: "generating", text: "" }),
    ]);
    expect(merged.generating).toBe(true);
    expect(merged.activeRequestId).toBe("stream-1");
    expect(merged.toolCalls).toEqual([
      expect.objectContaining({
        permission: "none",
        title: "No tools executed",
      }),
    ]);
  });

  it("appends stream tokens and marks the assistant reply ready on done", () => {
    const started = mergeStreamStartIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        requestId: "stream-1",
        userMessage: { id: "user-1", role: "user", text: "Hello" },
      },
    );
    const withToken = mergeStreamEventIntoChatData(started, {
      requestId: "stream-1",
      text: "Hello ",
      token: "Hello ",
      type: "token",
    });
    const done = mergeStreamEventIntoChatData(withToken, {
      metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
      requestId: "stream-1",
      status: "done",
      text: "Hello world",
      type: "done",
    });

    expect(withToken.chatMessages.at(-1)).toMatchObject({
      id: "assistant-stream-1",
      status: "generating",
      text: "Hello ",
    });
    expect(done.chatMessages.at(-1)).toMatchObject({
      metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
      status: "ready",
      text: "Hello world",
    });
    expect(done.generating).toBe(false);
  });

  it("marks streaming replies cancelled or errored without dropping the user message", () => {
    const started = mergeStreamStartIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        requestId: "stream-1",
        userMessage: { id: "user-1", role: "user", text: "Hello" },
      },
    );
    const cancelled = mergeStreamEventIntoChatData(started, {
      requestId: "stream-1",
      status: "cancelled",
      text: "Partial",
      type: "cancelled",
    });
    const errored = mergeStreamEventIntoChatData(started, {
      error: {
        code: "LLM_REQUEST_FAILED",
        message: "LLM request failed.",
      },
      requestId: "stream-1",
      type: "error",
    });

    expect(cancelled.chatMessages).toEqual([
      expect.objectContaining({ role: "user", text: "Hello" }),
      expect.objectContaining({ role: "assistant", status: "cancelled", text: "Partial" }),
    ]);
    expect(cancelled.generating).toBe(false);
    expect(errored.chatMessages).toEqual([
      expect.objectContaining({ role: "user", text: "Hello" }),
      expect.objectContaining({ role: "assistant", status: "error" }),
    ]);
    expect(errored.sendError).toEqual({
      code: "LLM_REQUEST_FAILED",
      message: "LLM request failed.",
    });
    expect(errored.toolCalls).toEqual([
      expect.objectContaining({
        permission: "none",
        title: "No tools executed",
      }),
    ]);
  });

  it("merges the final streaming result into the existing assistant placeholder without duplicating messages", () => {
    const started = mergeStreamStartIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        requestId: "stream-1",
        userMessage: { id: "user-stream-1", role: "user", text: "Hello" },
      },
    );
    const merged = mergeStreamResultIntoChatData(started, {
      assistantMessage: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        source: "llm",
        status: "ready",
        text: "Final answer",
      },
      contextPack: {
        items: [{ title: "Docs", type: "kb" }],
      },
      requestId: "stream-1",
      status: "ready",
      toolCalls: [
        {
          duration: "0ms",
          permission: "none",
          state: "done",
          title: "No tools executed",
        },
      ],
      userMessage: { id: "user-stream-1", role: "user", text: "Hello" },
    });

    expect(merged.chatMessages).toEqual([
      expect.objectContaining({ id: "user-stream-1", role: "user", text: "Hello" }),
      expect.objectContaining({
        id: "assistant-stream-1",
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
        role: "assistant",
        status: "ready",
        text: "Final answer",
      }),
    ]);
    expect(merged.contextItems).toEqual([expect.objectContaining({ title: "Docs", type: "kb" })]);
    expect(merged.generating).toBe(false);
    expect(merged.toolCalls).toEqual([
      expect.objectContaining({
        permission: "none",
        title: "No tools executed",
      }),
    ]);
  });

  it("merges tool-augmented stream results into context and timeline without leaking secrets", () => {
    const started = mergeStreamStartIntoChatData(
      { chatMessages: [], contextItems: [], toolCalls: [] },
      {
        requestId: "stream-tools-1",
        userMessage: { id: "user-stream-tools-1", role: "user", text: "Search docs" },
      },
    );
    const merged = mergeStreamResultIntoChatData(started, {
      assistantMessage: {
        metadata: { model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
        role: "assistant",
        source: "llm",
        status: "ready",
        text: "Final answer",
      },
      contextPack: {
        items: [
          {
            excerpt: "Knowledge Search: apiKey=[redacted]",
            sourceType: "tool",
            title: "Tool: Knowledge Search",
            type: "tool",
          },
        ],
      },
      requestId: "stream-tools-1",
      status: "ready",
      toolCalls: [
        {
          permission: "Level 1 / read-only",
          permissionLevel: 1,
          state: "completed",
          title: "Knowledge Search",
          toolId: "kb.searchLocal",
        },
      ],
      toolResultsSummary: [
        {
          status: "completed",
          summary: "Knowledge Search: apiKey=[redacted]",
          toolId: "kb.searchLocal",
        },
      ],
      userMessage: { id: "user-stream-tools-1", role: "user", text: "Search docs" },
    });

    expect(merged.contextItems).toEqual([expect.objectContaining({
      title: "Tool: Knowledge Search",
      type: "tool",
    })]);
    expect(merged.toolCalls).toEqual([
      expect.objectContaining({
        permission: "Level 1 / read-only",
        state: "completed",
        toolId: "kb.searchLocal",
      }),
    ]);
    expect(JSON.stringify(merged)).not.toMatch(/sk-|apiKey=sk-|token=|secret=|Authorization/i);
  });
});
