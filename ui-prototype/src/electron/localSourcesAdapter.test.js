import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalSourcesData } from "./localSourcesAdapter";

describe("local sources adapter", () => {
  it("reports local source paths and their read status", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sources-"));
    const agentConfigPath = path.join(rootDir, "agents", "agents.json");
    const chatSessionPath = path.join(rootDir, "agent-chat", "session.json");
    const docsDir = path.join(rootDir, "docs");
    const codeDir = path.join(rootDir, "repo");
    const intelDir = path.join(rootDir, "intel");

    await fs.mkdir(path.dirname(agentConfigPath), { recursive: true });
    await fs.mkdir(path.dirname(chatSessionPath), { recursive: true });
    await fs.mkdir(docsDir);
    await fs.mkdir(codeDir);
    await fs.mkdir(intelDir);
    await fs.writeFile(agentConfigPath, "{}");
    await fs.writeFile(chatSessionPath, "{}");

    const data = await getLocalSourcesData({
      agentChatSessionPath: chatSessionPath,
      agentManagementConfigPath: agentConfigPath,
      codeRepositoryRootDir: codeDir,
      knowledgeBaseRootDir: docsDir,
      localIntelRootDir: intelDir,
      localMusicRootDir: path.join(rootDir, "missing-music"),
      widgetsDiskRoot: rootDir,
    });

    expect(data.summary).toEqual({
      missing: 1,
      ready: 6,
      total: 7,
      unconfigured: 0,
      unreadable: 0,
    });
    expect(data.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "agent-management",
          module: "Agent Management",
          path: agentConfigPath,
          state: "ready",
          type: "file",
        }),
        expect.objectContaining({
          id: "local-music",
          configured: true,
          module: "Local Music",
          state: "missing",
          status: "missing",
          type: "directory",
        }),
      ]),
    );
  });

  it("marks phase-2 sources as unconfigured instead of using fake default success", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sources-"));

    const data = await getLocalSourcesData({
      widgetsDiskRoot: rootDir,
    });

    expect(data.summary).toMatchObject({
      total: 7,
      unconfigured: 4,
    });
    expect(data.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          configured: false,
          id: "knowledge-base",
          status: "unconfigured",
        }),
        expect.objectContaining({
          configured: false,
          id: "code-repository",
          status: "unconfigured",
        }),
        expect.objectContaining({
          configured: false,
          id: "local-intel",
          status: "unconfigured",
        }),
        expect.objectContaining({
          configured: false,
          id: "local-music",
          status: "unconfigured",
        }),
      ]),
    );
  });
});
