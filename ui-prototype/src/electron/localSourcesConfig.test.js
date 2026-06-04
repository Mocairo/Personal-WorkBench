import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadLocalSourcesConfig,
  resolveLocalSourcesConfigPath,
  saveLocalSourcesConfig,
} from "./localSourcesConfig";

describe("local sources config", () => {
  it("resolves the persisted config path from userData by default", () => {
    expect(resolveLocalSourcesConfigPath({ userDataDir: "D:\\ConsoleData" })).toBe(
      path.join("D:\\ConsoleData", "config", "local-sources.json"),
    );
  });

  it("loads missing config as empty paths", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sources-config-"));

    await expect(
      loadLocalSourcesConfig({ configPath: path.join(rootDir, "missing.json") }),
    ).resolves.toEqual({ paths: {} });
  });

  it("saves and reloads normalized path config", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sources-config-"));
    const configPath = path.join(rootDir, "nested", "local-sources.json");

    await saveLocalSourcesConfig(
      {
        paths: {
          agentChatSession: path.join(rootDir, "agent-chat", "session.json"),
          agentManagementConfig: path.join(rootDir, "agents", "agents.json"),
          ignored: "",
          knowledgeBaseRoot: path.join(rootDir, "docs"),
        },
      },
      { configPath },
    );

    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({
      paths: {
        agentChatSession: path.join(rootDir, "agent-chat", "session.json"),
        agentManagementConfig: path.join(rootDir, "agents", "agents.json"),
        knowledgeBaseRoot: path.join(rootDir, "docs"),
      },
    });
  });

  it("accepts phase-2 path aliases without persisting secret-like fields", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sources-config-"));
    const configPath = path.join(rootDir, "nested", "local-sources.json");

    await saveLocalSourcesConfig(
      {
        paths: {
          codeRepositoryPath: path.join(rootDir, "repo"),
          ignoredSecret: "sk-should-not-save",
          knowledgeBasePath: path.join(rootDir, "docs"),
          localIntelPath: path.join(rootDir, "intel"),
          musicLibraryPath: path.join(rootDir, "Music"),
        },
      },
      { configPath },
    );

    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({
      paths: {
        codeRepositoryRoot: path.join(rootDir, "repo"),
        knowledgeBaseRoot: path.join(rootDir, "docs"),
        localIntelRoot: path.join(rootDir, "intel"),
        localMusicRoot: path.join(rootDir, "Music"),
      },
    });
  });
});
