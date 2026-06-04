import { describe, expect, it } from "vitest";
import {
  buildAgentContextPack,
  buildAgentDraftMessage,
  buildAgentDryRunResult,
  buildDryRunAssistantResponse,
  buildPermissionPreview,
  buildPromptPreview,
  buildToolPlanPreview,
} from "./agentDryRunContracts";

describe("Agent dry-run contracts", () => {
  it("builds a stable sanitized draft message", () => {
    expect(buildAgentDraftMessage({
      agentId: "agent-repo",
      sessionId: "session-1",
      userText: "Read D:\\private\\repo and token=sk-secret",
    })).toMatchObject({
      agentId: "agent-repo",
      sessionId: "session-1",
      source: "local",
      status: "ready",
      userText: "Read [path] and [redacted]",
    });
  });

  it("limits and redacts context pack items", () => {
    const pack = buildAgentContextPack({
      items: [
        { excerpt: "Use apiKey=sk-hidden", id: "kb-1", relativePath: "D:\\docs\\secret.md", title: "Secret Doc", type: "kb" },
        { excerpt: "Repository summary", id: "repo-1", relativePath: "src/main.js", title: "Repo", type: "code" },
      ],
      maxItems: 1,
      sessionId: "session-1",
    });

    expect(pack.items).toHaveLength(1);
    expect(pack.items[0]).toMatchObject({
      excerpt: "Use [redacted]",
      relativePath: "[path]",
      source: "local",
      title: "Secret Doc",
    });
    expect(JSON.stringify(pack)).not.toMatch(/sk-hidden|D:\\docs/);
  });

  it("builds prompt, tool, permission and dry-run response previews", () => {
    const promptPreview = buildPromptPreview({
      contextItems: [{ title: "Docs", type: "kb" }],
      userText: "Summarize current workspace",
    });
    const toolPlan = buildToolPlanPreview({
      tools: [
        { permissionLevel: 1, toolId: "kb.search", title: "Search KB" },
        { permissionLevel: 2, toolId: "notes.write", title: "Write note" },
        { permissionLevel: 4, toolId: "shell.exec", title: "Run command" },
      ],
    });
    const permissionPreview = buildPermissionPreview({ toolPlan });
    const mockResponse = buildDryRunAssistantResponse({ contextItems: [{ title: "Docs" }], userText: "Summarize" });

    expect(promptPreview).toMatchObject({
      status: "ready",
      userText: "Summarize current workspace",
    });
    expect(toolPlan.items).toEqual([
      expect.objectContaining({ decision: "allowed", permissionLevel: 1, wouldExecute: false }),
      expect.objectContaining({ decision: "requiresApproval", permissionLevel: 2, wouldExecute: false }),
      expect.objectContaining({ decision: "denied", permissionLevel: 4, wouldExecute: false }),
    ]);
    expect(permissionPreview).toMatchObject({
      denied: 1,
      requiresApproval: 1,
      status: "permission_required",
    });
    expect(mockResponse).toMatchObject({
      role: "assistant",
      source: "dry-run",
      status: "ready",
    });
  });

  it("builds an aggregate dry-run result without secrets", () => {
    const result = buildAgentDryRunResult({
      draft: { userText: "Use sk-secret" },
      contextPack: { items: [{ title: "Docs", excerpt: "token=abc123" }] },
      toolPlan: { tools: [{ permissionLevel: 2, toolId: "notes.write" }] },
    });

    expect(result).toMatchObject({
      dryRun: true,
      status: "permission_required",
      toolPlan: {
        items: [expect.objectContaining({ decision: "requiresApproval" })],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-secret|token=abc123/);
  });
});
