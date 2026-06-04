import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsPanel, getSettingsDisplayData } from "./Settings";

describe("Settings page data", () => {
  it("normalizes local source summary and rows with mock-safe defaults", () => {
    const display = getSettingsDisplayData({
      llmModels: [
        {
          hasSecret: true,
          id: "openai:gpt-4.1-mini",
          label: "OpenAI / gpt-4.1-mini",
          message: "Provider ready",
          model: "gpt-4.1-mini",
          provider: "openai",
          secretHint: "sk-live-secret",
          status: "ready",
        },
      ],
      llmProviders: [
        {
          hasSecret: true,
          id: "openai",
          label: "OpenAI",
          message: "Provider ready",
          provider: "openai",
          secretHint: "sk-live-secret",
          status: "ready",
        },
      ],
      secrets: [{ configured: false, id: "llm-provider", label: "LLM Provider", masked: "not configured" }],
      sources: [
        {
          configured: true,
          detail: "File ready",
          id: "agent-chat",
          label: "Local session",
          module: "Agent Chat",
          path: "agent-chat/session.json",
          state: "ready",
          tone: "good",
          type: "file",
        },
        {
          configured: false,
          id: "knowledge-base",
          label: "Knowledge Base",
          message: "Choose a folder",
          path: "",
          status: "unconfigured",
        },
      ],
      summary: { missing: 0, ready: 1, total: 2, unconfigured: 1, unreadable: 0 },
    });

    expect(display).toMatchObject({
      optionalSources: [
        {
          configured: true,
          detail: "File ready",
          id: "agent-chat",
          label: "Local session",
          module: "Agent Chat",
          path: "agent-chat/session.json",
          state: "ready",
          tone: "good",
          type: "file",
        },
      ],
      requiredSources: [
        {
          configured: false,
          id: "knowledge-base",
          label: "Knowledge Base",
          message: "Choose a folder",
          path: "",
          status: "unconfigured",
        },
      ],
      secrets: [
        {
          configured: false,
          id: "llm-provider",
          label: "LLM Provider",
          masked: "not configured",
        },
      ],
      llmModels: [
        {
          hasSecret: true,
          id: "openai:gpt-4.1-mini",
          label: "OpenAI / gpt-4.1-mini",
          message: "Provider ready",
          model: "gpt-4.1-mini",
          provider: "openai",
          secretHint: "[redacted]",
          status: "ready",
        },
      ],
      llmProviders: [
        {
          hasSecret: true,
          id: "openai",
          label: "OpenAI",
          message: "Provider ready",
          provider: "openai",
          secretHint: "[redacted]",
          status: "ready",
        },
      ],
      sources: [
        {
          configured: true,
          detail: "File ready",
          id: "agent-chat",
          label: "Local session",
          module: "Agent Chat",
          path: "agent-chat/session.json",
          state: "ready",
          tone: "good",
          type: "file",
        },
        {
          configured: false,
          id: "knowledge-base",
          label: "Knowledge Base",
          message: "Choose a folder",
          path: "",
          status: "unconfigured",
        },
      ],
      summary: { missing: 0, mock: 0, ready: 1, total: 2, unconfigured: 1, unreadable: 0 },
    });
    expect(JSON.stringify(display)).not.toMatch(/sk-live-secret|apiKey|token=/);
  });

  it("renders compact path management controls", () => {
    const markup = renderToStaticMarkup(<SettingsPanel onClose={() => {}} />);

    expect(markup).toContain("Local Sources");
    expect(markup).toContain("Sync sources");
    expect(markup).toContain("Choose");
    expect(markup).toContain("Knowledge Base");
    expect(markup).toContain("Code Repository");
    expect(markup).toContain("local-intel");
    expect(markup).toContain("Music Library");
    expect(markup).toContain("Secret status");
    expect(markup).toContain("Provider status");
    expect(markup).toContain("Model status");
    expect(markup).toContain("saved on selection");
  });
});
