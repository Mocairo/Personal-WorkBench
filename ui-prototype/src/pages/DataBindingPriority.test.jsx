import { describe, expect, it } from "vitest";
import { getAgentRows } from "./AgentManagement";
import { getRepositoryDisplayData, getRepositoryTreeRows } from "./CodeRepository";
import { getIntelDisplayData } from "./IntelCenter";
import { getKnowledgeDisplayData, getKnowledgeDocumentRows } from "./KnowledgeBase";
import { mergeAudioMetadata } from "./LocalMusic";

describe("page data binding priority", () => {
  it("keeps provider document state ahead of knowledge fallback metadata", () => {
    const [doc] = getKnowledgeDocumentRows([
      { chunks: 3, kind: "md", state: "provider-indexed", tag: "notes", title: "README.md" },
    ]);

    expect(doc).toMatchObject({ state: "provider-indexed", tag: "notes", title: "README.md" });
  });

  it("renders repository tree rows from provider repoFiles instead of the static fallback tree", () => {
    const rows = getRepositoryTreeRows([{ depth: 1, meta: "React", name: "ProviderOnly.jsx", state: "modified" }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "ProviderOnly.jsx", state: "modified" });
  });

  it("keeps agent tool names from provider data while deriving counts", () => {
    const [agent] = getAgentRows([{ name: "Provider Agent", state: "online", tools: "git, parser, terminal" }]);

    expect(agent.toolList).toEqual(["git", "parser", "terminal"]);
    expect(agent.toolCount).toBe(3);
  });

  it("keeps intel source and collection states from provider objects", () => {
    const data = getIntelDisplayData({
      collectionSteps: [{ label: "Normalize feeds", progress: "64%", state: "normalizing" }],
      intelCards: [{ confidence: "99%", priority: "high", source: "feed", state: "ready", tags: "feed", time: "12:00", title: "Signal" }],
      intelSources: [{ checks: "5 checks", label: "RSS", state: "paused" }],
      providerStatus: { message: "local path configured", status: "ready" },
    });

    expect(data.intelSources[0]).toMatchObject({ label: "RSS", state: "paused" });
    expect(data.collectionSteps[0]).toMatchObject({ label: "Normalize feeds", state: "normalizing" });
    expect(data.providerStatus).toMatchObject({ status: "ready" });
  });

  it("deduplicates local music metadata fallback rows by label", () => {
    const rows = mergeAudioMetadata([{ label: "Bitrate", value: "320 kbps" }]);

    expect(rows.filter((item) => item.label === "Bitrate")).toHaveLength(1);
    expect(rows).toContainEqual({ label: "Mode", value: "exclusive" });
  });

  it("keeps provider status visible for local-backed page helpers", () => {
    expect(
      getKnowledgeDisplayData({
        providerStatus: { message: "Using mock data", status: "mock" },
        sourceHealth: { configured: false, status: "unconfigured" },
      }),
    ).toMatchObject({
      providerStatus: { status: "mock" },
      sourceHealth: { status: "unconfigured" },
    });

    expect(
      getRepositoryDisplayData({
        providerStatus: { message: "Path not found", status: "missing" },
        sourceHealth: { configured: true, status: "missing" },
      }),
    ).toMatchObject({
      providerStatus: { message: "Path not found", status: "missing" },
      sourceHealth: { status: "missing" },
    });
  });
});
