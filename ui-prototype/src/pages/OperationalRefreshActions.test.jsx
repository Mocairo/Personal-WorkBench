import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentChat } from "./AgentChat";
import { AgentManagement } from "./AgentManagement";
import { CodeRepository } from "./CodeRepository";
import { HomeDashboard } from "./HomeDashboard";
import { IntelCenter } from "./IntelCenter";
import { KnowledgeBase } from "./KnowledgeBase";
import { LocalMusic } from "./LocalMusic";
import { Widgets } from "./Widgets";

const pages = [
  { Page: HomeDashboard, labels: ["Task Center", "Sync Now"], title: "Home Dashboard" },
  { Page: AgentChat, labels: ["New Chat", "Tools"], title: "Agent Chat" },
  { Page: KnowledgeBase, labels: ["Import", "Reindex"], title: "Knowledge Base" },
  { Page: AgentManagement, labels: ["New Agent", "Policy"], title: "Agent Management" },
  { Page: CodeRepository, labels: ["Scan", "Open Root"], title: "Code Repository" },
  { Page: LocalMusic, labels: ["Library", "Output"], title: "Local Music" },
  { Page: IntelCenter, labels: ["Sources", "Report"], title: "Intel Center" },
  { Page: Widgets, labels: ["Add Widget", "Arrange"], title: "Widgets" },
];

describe("operational page actions", () => {
  it.each(pages)("$title exposes module-specific desktop actions instead of a global refresh button", ({ Page, labels }) => {
    const markup = renderToStaticMarkup(<Page />);

    expect(markup).not.toContain("Refresh");
    labels.forEach((label) => {
      expect(markup).toContain(label);
    });
  });
});
