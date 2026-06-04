import { describe, expect, it, vi } from "vitest";
import {
  prepareMessageDraft,
  previewContextPack,
  previewToolPlan,
  runDryMessage,
} from "./agentDryRunAdapter";

function createProvider(overrides = {}) {
  return {
    async getAgentChat() {
      return {
        contextItems: [{ title: "Pinned doc", type: "doc", relativePath: "docs/pinned.md" }],
        session: { activeAgentId: "agent-repo", sessionId: "session-1" },
      };
    },
    async getAgentManagement() {
      return {
        agents: [
          {
            id: "agent-repo",
            name: "Repo Analyst",
            permission: "ask",
            toolBindings: [
              { name: "Knowledge Search", permissionLevel: 1, toolId: "kb.search" },
              { name: "Write Notes", permissionLevel: 2, toolId: "notes.write" },
              { name: "Shell", permissionLevel: 4, toolId: "shell.exec" },
            ],
          },
        ],
      };
    },
    async getCodeRepository() {
      return {
        gitState: { branch: "main", changed: 2 },
        repoFiles: [{ name: "mainProvider.js", relativePath: "src/electron/mainProvider.js" }],
        repoMetrics: { fileCount: 4, modules: 2 },
      };
    },
    async getIntelCenter() {
      return {
        intelCards: [{ reportId: "r1", summary: "token=sk-intel", title: "Daily Report" }],
      };
    },
    async getKnowledgeBase() {
      return {
        knowledgeDocuments: [{ preview: "apiKey=sk-kb", relativePath: "D:\\docs\\kb.md", title: "KB Doc", type: "md" }],
      };
    },
    ...overrides,
  };
}

describe("Agent dry-run adapter", () => {
  it("prepares a stable draft without exposing secrets", async () => {
    const draft = await prepareMessageDraft({
      agentId: "agent-repo",
      sessionId: "session-1",
      userText: "Check token=sk-draft",
    });

    expect(draft).toMatchObject({
      agentId: "agent-repo",
      sessionId: "session-1",
      status: "ready",
      userText: "Check [redacted]",
    });
  });

  it("previews a context pack from read-only provider summaries", async () => {
    const pack = await previewContextPack(
      { agentId: "agent-repo", sessionId: "session-1", userText: "Summarize" },
      { provider: createProvider() },
    );

    expect(pack.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "kb", title: "KB Doc" }),
      expect.objectContaining({ sourceType: "code", title: "Repository" }),
      expect.objectContaining({ sourceType: "intel", title: "Daily Report" }),
      expect.objectContaining({ sourceType: "agent", title: "Repo Analyst" }),
    ]));
    expect(JSON.stringify(pack)).not.toMatch(/sk-kb|sk-intel|D:\\docs/);
  });

  it("previews tool plan decisions without executing tools", async () => {
    const executor = vi.fn();
    const plan = await previewToolPlan(
      { agentId: "agent-repo", userText: "Search then write and run command" },
      { executeTool: executor, provider: createProvider() },
    );

    expect(executor).not.toHaveBeenCalled();
    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ decision: "allowed", permissionLevel: 1, toolId: "kb.search" }),
      expect.objectContaining({ decision: "requiresApproval", permissionLevel: 2, toolId: "notes.write" }),
      expect.objectContaining({ decision: "denied", permissionLevel: 4, toolId: "shell.exec" }),
    ]));
  });

  it("runs a complete dry message preview without real LLM or tools", async () => {
    const llmClient = vi.fn();
    const executeTool = vi.fn();
    const result = await runDryMessage(
      { agentId: "agent-repo", sessionId: "session-1", userText: "Summarize the current workspace" },
      { executeTool, llmClient, provider: createProvider() },
    );

    expect(llmClient).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      mockResponse: expect.objectContaining({ role: "assistant", source: "dry-run" }),
      permissionPreview: expect.objectContaining({ status: "permission_required" }),
      status: "permission_required",
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-|apiKey|token=/);
  });
});
