import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendAgentChatSessionTurn,
  getAgentChatUserDataSessionPath,
  readAgentChatUserDataSession,
} from "./agentChatSessionStore";

describe("agent chat userData session store", () => {
  it("resolves the app-owned session file under Electron userData", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-user-data-"));

    expect(getAgentChatUserDataSessionPath({ userDataDir })).toBe(
      path.join(userDataDir, "sessions", "agent-chat-session.json"),
    );
  });

  it("writes chat turns only to the userData session file and redacts secrets", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-store-"));
    const userDataDir = path.join(rootDir, "userData");
    const readOnlySessionPath = path.join(rootDir, "agent-chat", "session.json");
    await fs.mkdir(path.dirname(readOnlySessionPath), { recursive: true });
    await fs.writeFile(
      readOnlySessionPath,
      JSON.stringify({ chatMessages: [{ role: "assistant", text: "fallback unchanged" }] }),
    );

    const result = await appendAgentChatSessionTurn(
      {
        assistantMessage: {
          metadata: {
            apiKey: "sk-should-never-persist",
            model: "gpt-4.1-mini",
            provider: "openai",
            token: "secret-token",
          },
          role: "assistant",
          source: "llm",
          text: "Answer with Authorization: Bearer sk-assistant-secret",
        },
        createdAt: "2026-06-04T10:00:00.000Z",
        userMessage: {
          role: "user",
          text: "Hello apiKey=sk-user-secret",
        },
      },
      {
        sessionPath: readOnlySessionPath,
        userDataDir,
      },
    );

    const persistedPath = getAgentChatUserDataSessionPath({ userDataDir });
    const persisted = await fs.readFile(persistedPath, "utf8");
    const fallback = await fs.readFile(readOnlySessionPath, "utf8");

    expect(result).toMatchObject({
      sessionPath: persistedPath,
      status: "saved",
    });
    expect(JSON.parse(persisted)).toMatchObject({
      chatMessages: [
        expect.objectContaining({ role: "user", text: "Hello [redacted]" }),
        expect.objectContaining({
          metadata: {
            model: "gpt-4.1-mini",
            provider: "openai",
            toolCalls: 0,
          },
          role: "assistant",
          text: "Answer with [redacted]",
        }),
      ],
      session: {
        source: "userData",
        status: "ready",
      },
    });
    expect(persisted).not.toMatch(/sk-user-secret|sk-assistant-secret|sk-should-never-persist|secret-token|apiKey|token|secret|Authorization/i);
    expect(fallback).toContain("fallback unchanged");
  });

  it("reads an existing userData session when present", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-read-user-data-"));
    const sessionPath = getAgentChatUserDataSessionPath({ userDataDir });
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.writeFile(
      sessionPath,
      JSON.stringify({
        chatMessages: [{ role: "assistant", text: "Loaded from userData token=sk-hidden" }],
        session: { id: "persisted-session", title: "Persisted chat" },
      }),
    );

    await expect(readAgentChatUserDataSession({ userDataDir })).resolves.toMatchObject({
      data: {
        chatMessages: [{ role: "assistant", text: "Loaded from userData token=sk-hidden" }],
        session: { id: "persisted-session" },
      },
      ok: true,
      sessionPath,
    });
  });

  it("persists sanitized tool timeline details without secrets or large raw payloads", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-tool-session-"));
    const largePreview = `${"A".repeat(1200)} token=sk-tool-secret D:\\private\\knowledge\\doc.md`;

    await appendAgentChatSessionTurn(
      {
        assistantMessage: {
          metadata: {
            apiKey: "sk-metadata-secret",
            model: "gpt-4.1-mini",
            provider: "openai",
            toolCalls: 1,
          },
          role: "assistant",
          source: "llm",
          text: "Final answer from tools token=sk-final-secret",
        },
        createdAt: "2026-06-04T11:00:00.000Z",
        providerMetadata: {
          apiKey: "sk-provider-secret",
          model: "gpt-4.1-mini",
          provider: "openai",
          requestHeaders: { Authorization: "Bearer sk-header-secret" },
        },
        toolCalls: [
          {
            meta: largePreview,
            permission: "Level 1 / read-only",
            state: "completed",
            title: "Knowledge Search",
            toolId: "kb.searchLocal",
          },
        ],
        toolDecisions: [
          { permissionLevel: 1, state: "completed", toolId: "kb.searchLocal" },
        ],
        toolPlan: {
          items: [
            {
              args: { query: "apiKey=sk-query-secret docs" },
              permissionLevel: 1,
              state: "planned",
              toolId: "kb.searchLocal",
            },
          ],
        },
        toolResultsSummary: [
          {
            label: "Knowledge Search",
            status: "completed",
            summary: largePreview,
            toolId: "kb.searchLocal",
          },
        ],
        userMessage: {
          role: "user",
          text: "Search docs secret=sk-user-secret",
        },
      },
      { userDataDir },
    );

    const persisted = await fs.readFile(getAgentChatUserDataSessionPath({ userDataDir }), "utf8");
    const parsed = JSON.parse(persisted);

    expect(parsed).toMatchObject({
      finalAnswer: "Final answer from tools [redacted]",
      providerMetadata: {
        model: "gpt-4.1-mini",
        provider: "openai",
        toolCalls: 1,
      },
      toolCalls: [
        expect.objectContaining({
          state: "completed",
          title: "Knowledge Search",
          toolId: "kb.searchLocal",
        }),
      ],
      toolDecisions: [
        expect.objectContaining({ state: "completed", toolId: "kb.searchLocal" }),
      ],
      toolPlan: {
        items: [
          expect.objectContaining({
            permissionLevel: 1,
            state: "planned",
            toolId: "kb.searchLocal",
          }),
        ],
      },
      toolResultsSummary: [
        expect.objectContaining({
          status: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(parsed.toolResultsSummary[0].summary.length).toBeLessThanOrEqual(360);
    expect(persisted).not.toMatch(/sk-|apiKey|token|secret|Authorization|requestHeaders|D:\\private/i);
    expect(persisted).not.toContain("A".repeat(800));
  });

  it("persists compact context summary without secrets, headers or raw absolute paths", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-context-session-"));

    await appendAgentChatSessionTurn(
      {
        assistantMessage: {
          metadata: {
            model: "gpt-4.1-mini",
            provider: "openai",
            toolCalls: 1,
          },
          role: "assistant",
          text: "Context-aware answer.",
        },
        contextSummary: {
          limits: {
            maxChars: 4000,
            maxItems: 6,
            maxMessages: 4,
          },
          providerMetadata: {
            apiKey: "sk-context-provider-secret",
            model: "gpt-4.1-mini",
            provider: "openai",
            requestHeaders: { Authorization: "Bearer sk-context-header" },
            toolCalls: 1,
          },
          trimmed: {
            contextItems: 1,
            history: 2,
            toolResults: 0,
          },
          usedContextItems: [
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
        createdAt: "2026-06-04T12:00:00.000Z",
        toolResultsSummary: [
          { status: "completed", summary: "Knowledge Search summary.", toolId: "kb.searchLocal" },
        ],
        userMessage: {
          role: "user",
          text: "Use memory.",
        },
      },
      { userDataDir },
    );

    const persisted = await fs.readFile(getAgentChatUserDataSessionPath({ userDataDir }), "utf8");
    const parsed = JSON.parse(persisted);

    expect(parsed.contextSummary).toMatchObject({
      limits: {
        maxChars: 4000,
        maxItems: 6,
        maxMessages: 4,
      },
      providerMetadata: {
        model: "gpt-4.1-mini",
        provider: "openai",
        toolCalls: 1,
      },
      trimmed: {
        contextItems: 1,
        history: 2,
        toolResults: 0,
      },
      usedContextItems: [
        expect.objectContaining({
          sourceType: "knowledge",
          status: "used",
          title: "[redacted-path] [redacted]",
        }),
      ],
      usedHistoryCount: 2,
      usedToolResults: [
        expect.objectContaining({
          label: "Knowledge Search [redacted]",
          sourceType: "tool",
          status: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(persisted).not.toMatch(/sk-|apiKey|token|secret|Authorization|requestHeaders|D:\\private/i);
  });
});
