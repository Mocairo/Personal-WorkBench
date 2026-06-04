import { describe, expect, it } from "vitest";
import {
  buildAgentChatMessage,
  buildAgentContextItem,
  buildAgentPermissionPolicy,
  buildAgentProfile,
  buildAgentSession,
  buildAgentToolCall,
  buildAgentToolBinding,
  redactAgentText,
} from "./agentContracts";

describe("agent contracts", () => {
  it("normalizes rich agent profiles without leaking secrets", () => {
    const agent = buildAgentProfile({
      id: "agent-repo",
      name: "Repo Analyst",
      description: "Reads repositories with apiKey=sk-agent-secret",
      state: "online",
      tools: [
        { id: "kb-search", name: "Knowledge Search", permissionLevel: "allow" },
        "repo-scan",
      ],
      permissionPolicy: {
        commandExecution: "ask",
        fileRead: "allow",
        modelCalls: "ask",
        networkAccess: "blocked",
      },
      model: {
        apiKey: "sk-model-secret",
        model: "gpt-4.1-mini",
        provider: "openai",
      },
      runtime: {
        lastRun: "2026-06-03T10:00:00.000Z",
        state: "ready",
      },
    });

    expect(agent).toMatchObject({
      agentId: "agent-repo",
      description: "Reads repositories with apiKey=[redacted]",
      id: "agent-repo",
      lastRun: "2026-06-03T10:00:00.000Z",
      model: "openai / gpt-4.1-mini",
      name: "Repo Analyst",
      permission: "ask",
      permissionLevel: "ask",
      runtimeState: "ready",
      source: "local",
      state: "online",
      status: "online",
      toolList: ["Knowledge Search", "repo-scan"],
      tools: "Knowledge Search, repo-scan",
      toolsCount: 2,
    });
    expect(JSON.stringify(agent)).not.toMatch(/sk-agent-secret|sk-model-secret|apiKey"\s*:/);
  });

  it("builds policy, tool, session, message, context, and tool-call records", () => {
    expect(buildAgentPermissionPolicy({ label: "Filesystem", state: "ask" })).toMatchObject({
      label: "Filesystem",
      state: "ask",
      status: "ask",
    });
    expect(buildAgentToolBinding({ name: "Read KB", permissionLevel: "allow" })).toMatchObject({
      name: "Read KB",
      permissionLevel: "allow",
      state: "ready",
    });
    expect(buildAgentSession({
      activeAgentId: "agent-repo",
      id: "session-1",
      lastUpdated: "2026-06-03T11:00:00.000Z",
      title: "Repository review",
    })).toMatchObject({
      activeAgentId: "agent-repo",
      id: "session-1",
      sessionId: "session-1",
      status: "ready",
      title: "Repository review",
    });
    expect(buildAgentChatMessage({
      content: "token=sk-message-secret should be hidden",
      role: "user",
    })).toMatchObject({
      role: "user",
      text: "token=[redacted] should be hidden",
    });
    expect(buildAgentContextItem({
      chunks: 7,
      relativePath: "docs/agent.md",
      title: "Agent docs",
      tokens: "2.1k",
      type: "doc",
    })).toMatchObject({
      chunks: 7,
      title: "Agent docs",
      tokens: "2.1k",
      type: "doc",
    });
    expect(buildAgentToolCall({
      duration: "320ms",
      permission: "read allowed",
      state: "done",
      title: "Read config",
    })).toMatchObject({
      duration: "320ms",
      meta: "local session",
      permission: "read allowed",
      state: "done",
      title: "Read config",
    });
  });

  it("redacts common credential shapes from plain text", () => {
    expect(redactAgentText("Authorization: Bearer sk-abc123 token=secret api_key=hidden password=pw")).toBe(
      "Authorization: Bearer [redacted] token=[redacted] api_key=[redacted] password=[redacted]",
    );
  });
});
