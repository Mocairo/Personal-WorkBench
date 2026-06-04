import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAgentChatData } from "./agentChatAdapter";
import { getAgentManagementData } from "./agentManagementAdapter";

describe("sample local config files", () => {
  it("provide default data for Agent Management and Agent Chat", async () => {
    await expect(getAgentManagementData({ rootDir: path.resolve("agents") })).resolves.toMatchObject({
      agents: expect.arrayContaining([
        expect.objectContaining({ name: "Repo Analyst", state: "online", tools: "git, parser, terminal" }),
      ]),
      permissionMetrics: ["File read", "Command execution", "Network access", "Model calls"],
    });

    await expect(getAgentChatData({ rootDir: path.resolve("agent-chat") })).resolves.toMatchObject({
      chatMessages: expect.arrayContaining([
        expect.objectContaining({ role: "user", text: "Summarize my local console workspace." }),
      ]),
      contextItems: expect.arrayContaining([
        expect.objectContaining({ relativePath: "docs/ui-data-contract.md", title: "docs/ui-data-contract.md" }),
      ]),
      toolCalls: expect.arrayContaining([
        expect.objectContaining({ title: "Read data contract", meta: "docs/ui-data-contract.md", state: "done" }),
      ]),
    });
  });
});
