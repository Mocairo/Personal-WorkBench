import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAgentManagementData } from "./agentManagementAdapter";

async function createAgentFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-management-"));
  await fs.writeFile(
    path.join(rootDir, "agents.json"),
    JSON.stringify(
      {
        agents: [
          {
            id: "agent-research",
            name: "Research Curator",
            description: "Reads docs with token=sk-agent-secret",
            model: {
              apiKey: "sk-model-secret",
              model: "gpt-4.1-mini",
              provider: "openai",
            },
            permissionPolicy: {
              commandExecution: "ask",
              fileRead: "allow",
              modelCalls: "ask",
              networkAccess: "blocked",
            },
            runtime: {
              lastRun: "2026-06-03T10:00:00.000Z",
              state: "ready",
            },
            state: "online",
            tools: [
              { id: "browser", name: "Browser", permissionLevel: "allow" },
              "rag",
              "report",
            ],
          },
          {
            name: "Repo Analyst",
            tools: "git, parser, terminal",
          },
        ],
        permissionMetrics: ["File read", "Command execution", "Network access"],
        permissionPolicies: [
          ["File read", "allow", "all agents"],
          { label: "Command execution", state: "ask", scope: "repo analyst only" },
        ],
      },
      null,
      2,
    ),
  );

  return rootDir;
}

describe("agent management adapter", () => {
  it("builds Agent Management data from a local agents.json file", async () => {
    const rootDir = await createAgentFixture();

    const data = await getAgentManagementData({ rootDir });

    expect(data).toMatchObject({
      agents: [
        {
          description: "Reads docs with token=[redacted]",
          id: "agent-research",
          lastRun: "2026-06-03T10:00:00.000Z",
          model: "openai / gpt-4.1-mini",
          name: "Research Curator",
          permission: "ask",
          runtimeState: "ready",
          state: "online",
          toolBindings: [
            expect.objectContaining({ name: "Browser", permissionLevel: "allow" }),
            expect.objectContaining({ name: "rag" }),
            expect.objectContaining({ name: "report" }),
          ],
          toolList: ["Browser", "rag", "report"],
          tools: "Browser, rag, report",
          toolsCount: 3,
        },
        {
          name: "Repo Analyst",
          state: "idle",
          tools: "git, parser, terminal",
        },
      ],
      permissionMetrics: ["File read", "Command execution", "Network access"],
      permissionPolicies: [
        expect.objectContaining({ label: "File read", state: "allow" }),
        expect.objectContaining({ label: "Command execution", state: "ask" }),
      ],
      providerStatus: { configured: true, status: "ready" },
    });
    expect(JSON.stringify(data)).not.toMatch(/sk-agent-secret|sk-model-secret|apiKey/);
  });

  it("returns safe defaults when agents.json is missing", async () => {
    const data = await getAgentManagementData({
      rootDir: path.join(os.tmpdir(), "missing-agent-management"),
    });

    expect(data).toMatchObject({
      agents: [],
      permissionMetrics: ["File read", "Command execution", "Network access", "Model calls"],
      permissionPolicies: expect.any(Array),
      providerStatus: { configured: false, status: "unconfigured" },
    });
  });

  it("returns a soft error state when agents.json is invalid", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-management-invalid-"));
    await fs.writeFile(path.join(rootDir, "agents.json"), "{ invalid json");

    const data = await getAgentManagementData({ rootDir });

    expect(data).toMatchObject({
      agents: [],
      permissionMetrics: ["File read", "Command execution", "Network access", "Model calls"],
      providerStatus: {
        configured: true,
        message: "Agent config JSON is invalid",
        status: "error",
      },
    });
  });
});
