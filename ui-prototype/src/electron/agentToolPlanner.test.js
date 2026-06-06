import { describe, expect, it } from "vitest";
import { buildAgentToolPlan } from "./agentToolPlanner";

describe("agent tool planner", () => {
  it("parses structured LLM tool plans and keeps only registered read-only calls executable", () => {
    const plan = buildAgentToolPlan({
      llmText: JSON.stringify({
        toolPlan: {
          items: [
            { args: { query: "local docs" }, toolId: "kb.searchLocal" },
            { args: { command: "npm test" }, permissionLevel: 4, toolId: "shell.exec" },
          ],
        },
      }),
      userText: "Search local docs",
    });

    expect(plan.items).toEqual([
      expect.objectContaining({
        args: { query: "local docs" },
        permissionLevel: 1,
        state: "planned",
        toolId: "kb.searchLocal",
      }),
      expect.objectContaining({
        permissionLevel: 4,
        state: "denied",
        toolId: "shell.exec",
      }),
    ]);
  });

  it("maps dry-run preview tool aliases to registered tools", () => {
    const plan = buildAgentToolPlan({
      dryRunToolPlan: {
        items: [
          { permissionLevel: 1, title: "Knowledge Search", toolId: "kb.search" },
          { permissionLevel: 2, title: "Draft Local Note", toolId: "notes.write" },
        ],
      },
      userText: "Search docs",
    });

    expect(plan.items).toEqual([
      expect.objectContaining({
        permissionLevel: 1,
        state: "planned",
        toolId: "kb.searchLocal",
      }),
      expect.objectContaining({
        permissionLevel: 2,
        state: "denied",
        toolId: "notes.write",
      }),
    ]);
  });

  it("infers local read-only intents and denied unsafe intents from user text", () => {
    const plan = buildAgentToolPlan({
      userText: [
        "search docs for settings",
        "show repo files and git summary",
        "list intel logs and agents sessions",
        "then run shell and start local-intel",
      ].join(", "),
    });

    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolId: "kb.searchLocal", state: "planned" }),
      expect.objectContaining({ toolId: "codeRepo.listFiles", state: "planned" }),
      expect.objectContaining({ toolId: "codeRepo.getGitSummary", state: "planned" }),
      expect.objectContaining({ toolId: "intel.listLogs", state: "planned" }),
      expect.objectContaining({ toolId: "agent.listAgents", state: "planned" }),
      expect.objectContaining({ toolId: "agent.listSessions", state: "planned" }),
      expect.objectContaining({ permissionLevel: 4, state: "denied", toolId: "shell.exec" }),
      expect.objectContaining({ permissionLevel: 3, state: "denied", toolId: "intel.startService" }),
    ]));
  });

  it("plans a bounded Knowledge search for ordinary Agent Chat questions", () => {
    const plan = buildAgentToolPlan({
      userText: "这几篇日记里我最近反复在提什么？",
    });

    expect(plan).toMatchObject({
      source: "local-planner",
      status: "planned",
    });
    expect(plan.items[0]).toMatchObject({
      args: { query: "这几篇日记里我最近反复在提什么？" },
      permissionLevel: 1,
      state: "planned",
      toolId: "kb.searchLocal",
    });
  });

  it("derives a Knowledge search query from recent history for short continuation replies", () => {
    const plan = buildAgentToolPlan({
      session: {
        chatMessages: [
          { role: "user", text: "我的论文模板里都有什么" },
          { role: "assistant", text: "需要我继续查找论文阅读模板的具体结构吗？" },
        ],
      },
      userText: "需要",
    });

    expect(plan.items[0]).toMatchObject({
      args: { query: expect.stringContaining("论文模板") },
      toolId: "kb.searchLocal",
    });
    expect(plan.items[0].args.query).not.toBe("需要");
  });
});
