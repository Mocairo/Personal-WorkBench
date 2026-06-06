import { describe, expect, it } from "vitest";
import { buildAgentLlmContext } from "./agentContextBuilder";

function baseInput(overrides = {}) {
  return {
    agentConfig: {
      name: "Repo Analyst",
      model: "openai / gpt-4.1-mini",
      permission: "read-only",
    },
    contextPack: {
      items: [
        {
          excerpt: "Knowledge note about Settings paths.",
          sourceType: "knowledge",
          title: "Settings docs",
        },
        {
          excerpt: "Branch main with no writes required.",
          sourceType: "code",
          title: "Repository summary",
        },
      ],
    },
    providerMetadata: {
      apiKey: "sk-provider-secret",
      model: "gpt-4.1-mini",
      provider: "openai",
      requestHeaders: { Authorization: "Bearer sk-header-secret" },
    },
    session: {
      chatMessages: [
        { role: "user", text: "Remember that Settings is a floating overlay." },
        { role: "assistant", text: "Settings remains a floating overlay." },
        { role: "user", text: "The Page Switcher has 8 cards." },
        { role: "assistant", text: "I will keep 8 cards and 8 wheel nodes." },
      ],
    },
    sourceSummaries: [
      {
        sourceType: "intel",
        summary: "Intel reports are read-only summaries.",
        title: "Intel summary",
      },
    ],
    toolResultsSummary: [
      {
        status: "completed",
        summary: "Knowledge Search: Settings docs mention overlay behavior.",
        toolId: "kb.searchLocal",
      },
    ],
    userText: "Use our prior UI constraints when answering.",
    ...overrides,
  };
}

function allMessageText(result) {
  return result.messages.map((message) => message.content).join("\n");
}

describe("agent context builder", () => {
  it("includes recent session history before the current user message", () => {
    const result = buildAgentLlmContext(baseInput(), {
      maxChars: 4000,
      maxItems: 8,
      maxMessages: 4,
    });

    expect(result.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ content: expect.stringContaining("Knowledge Search"), role: "system" }),
      expect.objectContaining({ content: "Remember that Settings is a floating overlay.", role: "user" }),
      expect.objectContaining({ content: "Settings remains a floating overlay.", role: "assistant" }),
      expect.objectContaining({ content: "The Page Switcher has 8 cards.", role: "user" }),
      expect.objectContaining({ content: "I will keep 8 cards and 8 wheel nodes.", role: "assistant" }),
      expect.objectContaining({ content: "Use our prior UI constraints when answering.", role: "user" }),
    ]);
    expect(result.contextSummary.usedHistoryCount).toBe(4);
    expect(result.contextSummary.usedContextItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "knowledge", title: "Settings docs" }),
      expect.objectContaining({ sourceType: "code", title: "Repository summary" }),
    ]));
    expect(result.contextSummary.usedToolResults).toEqual([
      expect.objectContaining({ sourceType: "tool", toolId: "kb.searchLocal" }),
    ]);
  });

  it("always keeps the current user message while trimming old history under budget", () => {
    const result = buildAgentLlmContext(baseInput({
      session: {
        chatMessages: [
          { role: "user", text: "old user message that should be trimmed first" },
          { role: "assistant", text: "old assistant message that should be trimmed first" },
          { role: "user", text: "recent user memory" },
          { role: "assistant", text: "recent assistant memory" },
        ],
      },
      userText: "CURRENT QUESTION MUST REMAIN EVEN WITH A VERY SMALL BUDGET",
    }), {
      maxChars: 260,
      maxItems: 2,
      maxMessages: 4,
      maxSectionChars: 80,
    });

    const text = allMessageText(result);
    expect(result.messages.at(-1)).toEqual({
      content: "CURRENT QUESTION MUST REMAIN EVEN WITH A VERY SMALL BUDGET",
      role: "user",
    });
    expect(text).not.toContain("old user message");
    expect(text).not.toContain("old assistant message");
    expect(result.contextSummary.trimmed.history).toBeGreaterThan(0);
  });

  it("prioritizes explicit attached knowledge contexts over ordinary context items", () => {
    const result = buildAgentLlmContext(baseInput({
      attachedKnowledgeContexts: [
        {
          contextId: "doc-pinned:chunk-1",
          matchType: "hybrid",
          preview: "ATTACHED NEEDLE summary should survive the budget.",
          relativePath: "docs/pinned.md",
          score: 9.5,
          sourceType: "knowledge",
          status: "attached",
          title: "Pinned KB Context",
        },
      ],
      contextPack: {
        items: [
          {
            excerpt: "LOW PRIORITY context should be trimmed when budget is tight.",
            sourceType: "knowledge",
            title: "Low priority KB",
          },
        ],
      },
      sourceSummaries: [],
      toolResultsSummary: [],
    }), {
      maxChars: 520,
      maxItems: 1,
      maxMessages: 0,
      maxSectionChars: 120,
    });

    const text = allMessageText(result);
    expect(text).toContain("Pinned KB Context");
    expect(text).toContain("ATTACHED NEEDLE");
    expect(text).toContain("docs/pinned.md");
    expect(text).toContain("hybrid");
    expect(text).not.toContain("LOW PRIORITY");
    expect(result.contextSummary.usedContextItems).toEqual([
      expect.objectContaining({
        id: "doc-pinned:chunk-1",
        sourceType: "knowledge",
        status: "attached",
        title: "Pinned KB Context",
      }),
    ]);
    expect(result.contextSummary.trimmed.contextItems).toBeGreaterThan(0);
  });

  it("builds bounded source refs from attached knowledge and kb.searchLocal results", () => {
    const result = buildAgentLlmContext(baseInput({
      attachedKnowledgeContexts: [
        {
          chunkId: "chunk-attached-1",
          contextId: "doc-attached:chunk-attached-1",
          documentId: "doc-attached",
          matchType: "attached",
          preview: "Pinned source preview with apiKey=sk-attached-source and D:\\private\\vault\\pin.md",
          relativePath: "notes/pinned.md",
          score: 8.75,
          sourceType: "knowledge",
          status: "attached",
          title: "Pinned Source",
        },
      ],
      contextPack: { items: [] },
      sourceSummaries: [],
      toolResultsSummary: [
        {
          label: "Knowledge Search",
          sourceRefs: [
            {
              chunkId: "chunk-tool-1",
              documentId: "doc-tool",
              matchType: "hybrid",
              preview: "Tool result preview with token=sk-tool-source.",
              relativePath: "docs/tool.md",
              score: 0.92,
              sourceType: "knowledge",
              title: "Tool Source",
            },
          ],
          status: "completed",
          summary: "Knowledge Search: Tool Source",
          toolId: "kb.searchLocal",
        },
      ],
    }), {
      maxChars: 4000,
      maxItems: 6,
      maxMessages: 2,
      maxSectionChars: 240,
    });

    const promptText = allMessageText(result);
    expect(result.contextSummary.sourceRefs).toEqual([
      expect.objectContaining({
        chunkId: "chunk-tool-1",
        documentId: "doc-tool",
        matchType: "hybrid",
        relativePath: "docs/tool.md",
        sourceRefId: "S1",
        sourceType: "knowledge",
        title: "Tool Source",
      }),
      expect.objectContaining({
        chunkId: "chunk-attached-1",
        documentId: "doc-attached",
        matchType: "attached",
        relativePath: "notes/pinned.md",
        sourceRefId: "S2",
        sourceType: "knowledge",
        title: "Pinned Source",
      }),
    ]);
    expect(promptText).toContain("Source References");
    expect(promptText).toContain("[S1] Tool Source");
    expect(promptText).toContain("[S2] Pinned Source");
    expect(JSON.stringify(result)).not.toMatch(/sk-attached-source|sk-tool-source|apiKey|token=|D:\\private/i);
  });

  it("redacts secrets and raw Windows paths from prompt messages and summary", () => {
    const result = buildAgentLlmContext(baseInput({
      contextPack: {
        items: [
          {
            excerpt: "apiKey=sk-context-secret Authorization: Bearer sk-auth-secret D:\\private\\kb\\doc.md",
            sourceType: "knowledge",
            title: "D:\\private\\kb\\doc.md",
          },
        ],
      },
      session: {
        chatMessages: [
          { role: "user", text: "token=sk-history-secret D:\\private\\session.txt" },
        ],
      },
      toolResultsSummary: [
        {
          status: "completed",
          summary: "secret=sk-tool-secret in D:\\private\\tool-output.txt",
          toolId: "kb.searchLocal",
        },
      ],
      userText: "Final question uses sk-user-secret and D:\\private\\question.txt",
    }), {
      maxChars: 4000,
      maxItems: 6,
      maxMessages: 4,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]+|apiKey|token=|secret=|Authorization|D:\\private/i);
    expect(serialized).toContain("[redacted]");
    expect(serialized).toContain("[redacted-path]");
  });
});
