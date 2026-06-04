import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAgentChatData } from "./agentChatAdapter";

async function createChatFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-"));
  await fs.writeFile(
    path.join(rootDir, "session.json"),
    JSON.stringify(
      {
        chatMessages: [
          { id: "msg-1", role: "user", text: "Summarize this workspace token=sk-chat-secret" },
          { role: "assistant", text: "I found docs and Electron adapters." },
          { role: "system", text: "Use local files only." },
        ],
        contextItems: [
          { chunks: 8, label: "docs/ui-data-contract.md", tokens: "2.4k", type: "doc", updatedAt: "2026-06-03T10:00:00.000Z" },
          { label: "src/electron/mainProvider.js", type: "code" },
          { path: "src/electron/agentChatAdapter.js" },
        ],
        session: {
          activeAgentId: "agent-repo",
          id: "session-local",
          lastUpdated: "2026-06-03T11:00:00.000Z",
          title: "Local agent session",
        },
        toolCalls: [
          { duration: "320ms", permission: "read allowed", title: "Read docs", meta: "ui-data-contract", state: "done" },
          { title: "Scan adapters" },
        ],
      },
      null,
      2,
    ),
  );

  return rootDir;
}

describe("agent chat adapter", () => {
  it("builds Agent Chat data from a local session.json file", async () => {
    const rootDir = await createChatFixture();

    const data = await getAgentChatData({ rootDir });

    expect(data).toMatchObject({
      chatMessages: [
        { id: "msg-1", role: "user", text: "Summarize this workspace token=[redacted]" },
        { role: "assistant", text: "I found docs and Electron adapters." },
        { role: "assistant", text: "Use local files only." },
      ],
      contextItems: [
        {
          chunks: 8,
          title: "docs/ui-data-contract.md",
          tokens: "2.4k",
          type: "doc",
          updatedAt: "2026-06-03T10:00:00.000Z",
        },
        { title: "src/electron/mainProvider.js", type: "code" },
        { title: "src/electron/agentChatAdapter.js" },
      ],
      session: {
        activeAgentId: "agent-repo",
        id: "session-local",
        sessionId: "session-local",
        status: "ready",
        title: "Local agent session",
      },
      toolCalls: [
        { duration: "320ms", meta: "ui-data-contract", permission: "read allowed", state: "done", title: "Read docs" },
        { meta: "local session", state: "done", title: "Scan adapters" },
      ],
      providerStatus: { configured: true, status: "ready" },
    });
    expect(JSON.stringify(data)).not.toMatch(/sk-chat-secret/);
  });

  it("returns safe empty data when session.json is missing", async () => {
    const data = await getAgentChatData({
      rootDir: path.join(os.tmpdir(), "missing-agent-chat"),
    });

    expect(data).toMatchObject({
      chatMessages: [],
      contextItems: [],
      providerStatus: { configured: false, status: "unconfigured" },
      session: { status: "unconfigured" },
      toolCalls: [],
    });
  });

  it("returns a soft error state when session.json is invalid", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-invalid-"));
    await fs.writeFile(path.join(rootDir, "session.json"), "{ invalid json");

    const data = await getAgentChatData({ rootDir });

    expect(data).toMatchObject({
      chatMessages: [],
      contextItems: [],
      providerStatus: {
        configured: true,
        message: "Agent session JSON is invalid",
        status: "error",
      },
      session: { status: "error" },
      toolCalls: [],
    });
  });

  it("prefers an app-owned userData session over the configured read-only local session", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-chat-user-data-priority-"));
    const userDataDir = path.join(rootDir, "userData");
    const localSessionPath = path.join(rootDir, "agent-chat", "session.json");
    const userDataSessionPath = path.join(userDataDir, "sessions", "agent-chat-session.json");

    await fs.mkdir(path.dirname(localSessionPath), { recursive: true });
    await fs.mkdir(path.dirname(userDataSessionPath), { recursive: true });
    await fs.writeFile(
      localSessionPath,
      JSON.stringify({ chatMessages: [{ role: "assistant", text: "Local fallback" }] }),
    );
    await fs.writeFile(
      userDataSessionPath,
      JSON.stringify({
        chatMessages: [{ role: "assistant", text: "Persisted userData session token=sk-hidden" }],
        session: {
          id: "persisted-session",
          title: "Persisted chat",
        },
      }),
    );

    const data = await getAgentChatData({
      sessionPath: localSessionPath,
      userDataDir,
    });

    expect(data).toMatchObject({
      chatMessages: [{ role: "assistant", text: "Persisted userData session token=[redacted]" }],
      providerStatus: {
        configured: true,
        status: "ready",
      },
      session: {
        sessionId: "persisted-session",
        source: "userData",
        title: "Persisted chat",
      },
    });
    expect(JSON.stringify(data)).not.toMatch(/sk-hidden/);
  });
});
