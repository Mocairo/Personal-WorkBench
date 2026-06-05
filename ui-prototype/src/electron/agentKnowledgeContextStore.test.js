import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addAgentKnowledgeContext,
  clearAgentKnowledgeContexts,
  getAgentKnowledgeContextStorePath,
  listAgentKnowledgeContexts,
  removeAgentKnowledgeContext,
} from "./agentKnowledgeContextStore";

describe("agent knowledge context store", () => {
  it("stores bounded sanitized attachments only under userData", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-kb-context-user-data-"));
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-kb-context-source-"));
    await fs.writeFile(path.join(sourceRoot, "original.md"), "# original\n");

    const result = await addAgentKnowledgeContext({
      chunkId: "chunk-1",
      documentId: "doc-1",
      matchType: "hybrid",
      preview: `Relevant excerpt apiKey=sk-preview-secret Authorization: Bearer token-secret ${"x".repeat(800)}`,
      relativePath: "D:\\private\\vault\\guide.md",
      score: 4.25,
      sessionId: "session-1",
      sourceType: "knowledge",
      title: "Guide token=sk-title-secret",
      updatedAt: "2026-06-05T10:00:00.000Z",
    }, {
      maxPreviewChars: 160,
      userDataDir,
    });

    expect(result).toMatchObject({
      status: "saved",
      sessionId: "session-1",
      attachedKnowledgeContexts: [
        expect.objectContaining({
          chunkId: "chunk-1",
          documentId: "doc-1",
          matchType: "hybrid",
          relativePath: "[redacted-path]",
          score: 4.25,
          sourceType: "knowledge",
        }),
      ],
    });
    expect(result.attachedKnowledgeContexts[0].preview.length).toBeLessThanOrEqual(160);

    const storePath = getAgentKnowledgeContextStorePath({ userDataDir });
    expect(storePath).toBe(path.join(userDataDir, "sessions", "agent-chat-knowledge-contexts.json"));
    const persisted = await fs.readFile(storePath, "utf8");
    expect(persisted).not.toMatch(/sk-preview-secret|sk-title-secret|Authorization|Bearer|apiKey|token=|D:\\private/);
    await expect(fs.access(path.join(sourceRoot, "sessions", "agent-chat-knowledge-contexts.json"))).rejects.toThrow();
  });

  it("lists, removes, clears and de-duplicates attached contexts per session", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-kb-context-list-"));

    await addAgentKnowledgeContext({
      chunkId: "chunk-1",
      documentId: "doc-1",
      preview: "first",
      relativePath: "docs/a.md",
      sessionId: "session-1",
      title: "A",
    }, { userDataDir });
    await addAgentKnowledgeContext({
      chunkId: "chunk-1",
      documentId: "doc-1",
      preview: "replacement",
      relativePath: "docs/a.md",
      sessionId: "session-1",
      title: "A updated",
    }, { userDataDir });
    await addAgentKnowledgeContext({
      chunkId: "chunk-2",
      documentId: "doc-2",
      preview: "other session",
      relativePath: "docs/b.md",
      sessionId: "session-2",
      title: "B",
    }, { userDataDir });

    await expect(listAgentKnowledgeContexts({ sessionId: "session-1" }, { userDataDir })).resolves.toMatchObject({
      attachedKnowledgeContexts: [
        expect.objectContaining({
          contextId: "doc-1:chunk-1",
          preview: "replacement",
          title: "A updated",
        }),
      ],
      sessionId: "session-1",
      total: 1,
    });

    await removeAgentKnowledgeContext({
      contextId: "doc-1:chunk-1",
      sessionId: "session-1",
    }, { userDataDir });
    await expect(listAgentKnowledgeContexts({ sessionId: "session-1" }, { userDataDir })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      total: 0,
    });

    await expect(listAgentKnowledgeContexts({ sessionId: "session-2" }, { userDataDir })).resolves.toMatchObject({
      attachedKnowledgeContexts: [expect.objectContaining({ contextId: "doc-2:chunk-2" })],
      total: 1,
    });

    await clearAgentKnowledgeContexts({ sessionId: "session-2" }, { userDataDir });
    await expect(listAgentKnowledgeContexts({ sessionId: "session-2" }, { userDataDir })).resolves.toMatchObject({
      attachedKnowledgeContexts: [],
      total: 0,
    });
  });
});
