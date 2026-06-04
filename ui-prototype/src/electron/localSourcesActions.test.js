import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLocalSourceConfigKey,
  saveLocalSourcePath,
  selectLocalSourcePath,
} from "./localSourcesActions";
import { loadLocalSourcesConfig } from "./localSourcesConfig";

describe("local sources actions", () => {
  it("maps settings source ids to persisted config keys", () => {
    expect(getLocalSourceConfigKey("agent-chat")).toBe("agentChatSession");
    expect(getLocalSourceConfigKey("knowledgeBasePath")).toBe("knowledgeBaseRoot");
    expect(getLocalSourceConfigKey("codeRepositoryPath")).toBe("codeRepositoryRoot");
    expect(getLocalSourceConfigKey("localIntelPath")).toBe("localIntelRoot");
    expect(getLocalSourceConfigKey("musicLibraryPath")).toBe("localMusicRoot");
    expect(getLocalSourceConfigKey("local-music")).toBe("localMusicRoot");
    expect(() => getLocalSourceConfigKey("unknown")).toThrow("Unknown local source");
  });

  it("saves a selected local source path into the persisted config", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-source-action-"));
    const configPath = path.join(rootDir, "config", "local-sources.json");
    const selectedPath = path.join(rootDir, "Music");

    const result = await saveLocalSourcePath("local-music", selectedPath, { configPath });

    expect(result).toEqual({
      paths: {
        localMusicRoot: selectedPath,
      },
    });
    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual(result);
  });

  it("selects a path with the right dialog mode and saves it", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-source-action-"));
    const configPath = path.join(rootDir, "config", "local-sources.json");
    const selectedPath = path.join(rootDir, "agents.json");
    const dialogCalls = [];
    const dialog = {
      async showOpenDialog(options) {
        dialogCalls.push(options);
        return { canceled: false, filePaths: [selectedPath] };
      },
    };

    await expect(
      selectLocalSourcePath("agent-management", { configPath, dialog }),
    ).resolves.toEqual({
      canceled: false,
      path: selectedPath,
    });
    expect(dialogCalls).toEqual([{ properties: ["openFile"] }]);
    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({
      paths: { agentManagementConfig: selectedPath },
    });
  });

  it("does not change config when dialog selection is canceled", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-source-action-"));
    const configPath = path.join(rootDir, "config", "local-sources.json");
    const dialog = {
      async showOpenDialog() {
        return { canceled: true, filePaths: [] };
      },
    };

    await expect(selectLocalSourcePath("code-repository", { configPath, dialog })).resolves.toEqual({
      canceled: true,
      path: null,
    });
    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({ paths: {} });
  });

  it("saves canonical phase-2 path ids through the same settings action", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-source-action-"));
    const configPath = path.join(rootDir, "config", "local-sources.json");
    const docsDir = path.join(rootDir, "docs");
    const otherDocsDir = path.join(rootDir, "other-docs");

    await saveLocalSourcePath("knowledgeBasePath", docsDir, { configPath });
    await saveLocalSourcePath("knowledge-base", otherDocsDir, { configPath });

    await expect(loadLocalSourcesConfig({ configPath })).resolves.toEqual({
      paths: {
        knowledgeBaseRoot: otherDocsDir,
      },
    });
  });
});
