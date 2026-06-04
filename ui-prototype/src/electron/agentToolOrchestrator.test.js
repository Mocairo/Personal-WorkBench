import { describe, expect, it, vi } from "vitest";
import { runAgentToolLoop } from "./agentToolOrchestrator";

function draft(userText = "search docs") {
  return {
    agentId: "agent-1",
    createdAt: "2026-06-04T10:00:00.000Z",
    id: "draft-1",
    sessionId: "session-1",
    userText,
  };
}

describe("agent tool orchestrator", () => {
  it("keeps Level 1 tools pending until approved", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(),
    };

    const result = await runAgentToolLoop({
      contextPack: { items: [] },
      draft: draft("search docs"),
      provider,
      toolPlan: {
        items: [{ args: { query: "docs" }, toolId: "kb.searchLocal" }],
      },
    });

    expect(provider.searchKnowledgeLocal).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      shouldCallLlm: false,
      status: "approval_required",
      toolCalls: [
        expect.objectContaining({
          state: "pending",
          status: "pending",
          toolId: "kb.searchLocal",
        }),
      ],
    });
  });

  it("executes only an approved Level 1 tool and adds its summary to LLM context", async () => {
    const provider = {
      listCodeRepositoryFiles: vi.fn(async () => [
        { absolutePath: "D:\\private\\repo\\src\\main.js", relativePath: "src/main.js", title: "main.js" },
      ]),
      searchKnowledgeLocal: vi.fn(),
    };

    const result = await runAgentToolLoop({
      contextPack: { items: [{ title: "Pinned", type: "session" }] },
      draft: draft("show repo files"),
      provider,
      toolPlan: {
        items: [
          { toolId: "kb.searchLocal", args: { query: "docs" } },
          { toolId: "codeRepo.listFiles" },
        ],
      },
      toolPolicy: {
        approvedToolIds: ["codeRepo.listFiles"],
      },
    });

    expect(provider.searchKnowledgeLocal).not.toHaveBeenCalled();
    expect(provider.listCodeRepositoryFiles).toHaveBeenCalledTimes(1);
    expect(result.shouldCallLlm).toBe(true);
    expect(result.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "pending", toolId: "kb.searchLocal" }),
      expect.objectContaining({ state: "completed", toolId: "codeRepo.listFiles" }),
    ]));
    expect(result.contextPack.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: "tool",
        title: "Tool: Repository Files",
      }),
    ]));
    expect(JSON.stringify(result)).not.toMatch(/D:\\private/);
  });

  it("auto-allows Level 1 read-only tools without allowing higher levels", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(async () => ({ results: [{ title: "Doc" }] })),
    };

    const result = await runAgentToolLoop({
      contextPack: { items: [] },
      draft: draft("search docs and run shell"),
      provider,
      toolPlan: {
        items: [
          { args: { query: "docs" }, toolId: "kb.searchLocal" },
          { args: { command: "echo unsafe" }, permissionLevel: 4, toolId: "shell.exec" },
        ],
      },
      toolPolicy: {
        autoAllowLevel1ReadOnly: true,
      },
    });

    expect(provider.searchKnowledgeLocal).toHaveBeenCalledTimes(1);
    expect(result.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "completed", toolId: "kb.searchLocal" }),
      expect.objectContaining({ state: "denied", toolId: "shell.exec" }),
    ]));
    expect(result.shouldCallLlm).toBe(true);
  });

  it("returns error events for provider failures without throwing", async () => {
    const provider = {
      listIntelLogs: vi.fn(async () => {
        throw new Error("token=sk-log-secret failed");
      }),
    };

    const result = await runAgentToolLoop({
      contextPack: { items: [] },
      draft: draft("show intel logs"),
      provider,
      toolPlan: {
        items: [{ toolId: "intel.listLogs" }],
      },
      toolPolicy: {
        autoAllowLevel1ReadOnly: true,
      },
    });

    expect(result).toMatchObject({
      shouldCallLlm: false,
      status: "tool_error",
      toolCalls: [
        expect.objectContaining({
          state: "error",
          status: "error",
          toolId: "intel.listLogs",
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-log-secret|token=/);
  });
});
