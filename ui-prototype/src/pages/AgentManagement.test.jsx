import { describe, expect, it } from "vitest";
import { getAgentRows, getPolicyRows } from "./AgentManagement";

describe("AgentManagement page data binding helpers", () => {
  it("prefers real agent fields over decorative fallbacks", () => {
    const rows = getAgentRows([
      {
        lastRun: "2026-06-03T10:00:00.000Z",
        model: "openai / gpt-4.1-mini",
        modelProfile: { provider: "openai", status: "ready" },
        name: "Repo Analyst",
        permission: "ask",
        permissionPolicy: { commandExecution: "ask", fileRead: "allow" },
        runtimeState: "ready",
        state: "online",
        toolBindings: [
          { name: "Knowledge Search" },
          { name: "Repo Scan" },
        ],
        tools: "Knowledge Search, Repo Scan",
        toolsCount: 2,
      },
    ]);

    expect(rows[0]).toMatchObject({
      lastRun: "2026-06-03T10:00:00.000Z",
      model: "openai / gpt-4.1-mini",
      modelStatus: "ready",
      name: "Repo Analyst",
      permission: "ask",
      providerStatus: "openai / ready",
      runtimeState: "ready",
      toolCount: 2,
      toolList: ["Knowledge Search", "Repo Scan"],
    });
  });

  it("uses configured policy rows when available", () => {
    const rows = getPolicyRows(["File read"], [
      { label: "File read", state: "allow", scope: "all agents" },
      { label: "Command execution", state: "ask", scope: "repo analyst only" },
    ]);

    expect(rows).toEqual([
      ["File read", "allow", "all agents"],
      ["Command execution", "ask", "repo analyst only"],
    ]);
  });
});
