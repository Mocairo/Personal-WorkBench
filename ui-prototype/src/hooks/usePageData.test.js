import { describe, expect, it } from "vitest";
import {
  loadAgentChatData,
  loadAgentManagementData,
  loadCodeRepositoryData,
  loadIntelCenterData,
  loadKnowledgeBaseData,
  loadLocalMusicData,
  loadProviderDataWithFallback,
  selectSettingsSourcePath,
  loadSettingsData,
  loadWidgetsData,
} from "./usePageData";

describe("page data hook helpers", () => {
  it("loads each page through the provided provider", async () => {
    const provider = {
      async getAgentChat() {
        return { chatMessages: ["message"], contextItems: ["context"], toolCalls: ["tool"] };
      },
      async getKnowledgeBase() {
        return { graphNodes: ["node"], knowledgeDocuments: ["doc"] };
      },
      async getAgentManagement() {
        return { agents: ["agent"], permissionMetrics: ["metric"] };
      },
      async getCodeRepository() {
        return { repoFiles: ["file"] };
      },
      async getLocalMusic() {
        return { audioMetadata: ["meta"], tracks: ["track"] };
      },
      async getIntelCenter() {
        return { collectionSteps: ["step"], intelCards: ["card"], intelSources: ["source"] };
      },
      async getWidgets() {
        return { clipboardItems: ["clip"], systemMetrics: ["metric"] };
      },
      async getSettings() {
        return { sources: ["source"], summary: { ready: 1 } };
      },
      async selectLocalSourcePath(sourceId) {
        return { canceled: false, sourceId };
      },
    };

    await expect(loadAgentChatData(provider)).resolves.toMatchObject({ chatMessages: ["message"] });
    await expect(loadKnowledgeBaseData(provider)).resolves.toMatchObject({ graphNodes: ["node"] });
    await expect(loadAgentManagementData(provider)).resolves.toMatchObject({ agents: ["agent"] });
    await expect(loadCodeRepositoryData(provider)).resolves.toMatchObject({ repoFiles: ["file"] });
    await expect(loadLocalMusicData(provider)).resolves.toMatchObject({ tracks: ["track"] });
    await expect(loadIntelCenterData(provider)).resolves.toMatchObject({ intelCards: ["card"] });
    await expect(loadWidgetsData(provider)).resolves.toMatchObject({ clipboardItems: ["clip"] });
    await expect(loadSettingsData(provider)).resolves.toMatchObject({ sources: ["source"] });
    await expect(selectSettingsSourcePath(provider, "local-music")).resolves.toMatchObject({
      sourceId: "local-music",
    });
  });

  it("keeps mock fallback data when a local provider request fails", async () => {
    const initialData = { chatMessages: [], contextItems: [], toolCalls: [] };
    const result = await loadProviderDataWithFallback(
      {
        async getAgentChat() {
          throw new Error("desktop api unavailable");
        },
      },
      loadAgentChatData,
      initialData,
    );

    expect(result).toMatchObject({
      data: initialData,
      loading: false,
    });
    expect(result.error).toBeInstanceOf(Error);
  });
});
