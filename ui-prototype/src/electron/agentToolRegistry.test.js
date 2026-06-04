import { describe, expect, it, vi } from "vitest";
import {
  executeRegisteredAgentTool,
  getRegisteredAgentTool,
  sanitizeToolResult,
} from "./agentToolRegistry";

describe("agent tool registry", () => {
  it("registers only Level 1 read-only tools", () => {
    expect(getRegisteredAgentTool("kb.searchLocal")).toMatchObject({
      label: "Knowledge Search",
      permissionLevel: 1,
      providerMethod: "searchKnowledgeLocal",
      toolId: "kb.searchLocal",
    });
    expect(getRegisteredAgentTool("shell.exec")).toBeNull();
    expect(getRegisteredAgentTool("notes.write")).toBeNull();
  });

  it("denies unregistered or elevated tools without calling providers", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(),
    };

    await expect(
      executeRegisteredAgentTool(
        { args: { command: "git reset --hard" }, permissionLevel: 4, toolId: "shell.exec" },
        { provider },
      ),
    ).resolves.toMatchObject({
      status: "denied",
      state: "denied",
      toolId: "shell.exec",
    });

    await expect(
      executeRegisteredAgentTool(
        { args: { query: "docs" }, permissionLevel: 2, toolId: "kb.searchLocal" },
        { provider },
      ),
    ).resolves.toMatchObject({
      status: "denied",
      state: "denied",
      toolId: "kb.searchLocal",
    });
    expect(provider.searchKnowledgeLocal).not.toHaveBeenCalled();
  });

  it("executes a registered tool with redacted args and sanitized limited results", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(async () => ({
        results: Array.from({ length: 12 }, (_, index) => ({
          absolutePath: `C:\\Users\\Mocairo\\secret-${index}.md`,
          preview: `Hit ${index} token=sk-result-secret`,
          relativePath: `docs/file-${index}.md`,
          title: `Doc ${index}`,
        })),
        source: "local",
      })),
    };

    const result = await executeRegisteredAgentTool(
      { args: { query: "apiKey=sk-query-secret docs" }, toolId: "kb.searchLocal" },
      { provider },
    );

    expect(provider.searchKnowledgeLocal).toHaveBeenCalledWith("apiKey=[redacted] docs");
    expect(result).toMatchObject({
      label: "Knowledge Search",
      status: "completed",
      state: "completed",
      toolId: "kb.searchLocal",
    });
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(result.summary.length).toBeLessThanOrEqual(900);
    expect(JSON.stringify(result)).not.toMatch(/sk-query-secret|sk-result-secret|C:\\Users\\Mocairo|token=/);
  });

  it("sanitizes nested tool results with item and character caps", () => {
    const sanitized = sanitizeToolResult(
      {
        items: Array.from({ length: 6 }, (_, index) => ({
          detail: `Authorization: Bearer sk-nested-${index}`,
          path: `D:\\private\\repo\\file-${index}.js`,
        })),
        message: "secret=sk-message-secret should be hidden",
      },
      {
        maxResultChars: 160,
        maxResultItems: 2,
      },
    );

    expect(sanitized.items).toHaveLength(2);
    expect(JSON.stringify(sanitized).length).toBeLessThanOrEqual(260);
    expect(JSON.stringify(sanitized)).not.toMatch(/sk-nested|sk-message-secret|D:\\private|Authorization|secret=/);
  });
});
