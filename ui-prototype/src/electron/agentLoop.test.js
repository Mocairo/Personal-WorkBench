import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agentLoop";

describe("agent loop", () => {
  it("lets the LLM request a tool, feeds the tool result back, then returns the final answer", async () => {
    const provider = {
      searchKnowledgeLocal: vi.fn(async (query) => ({
        results: [
          {
            preview: `Found ${query}`,
            relativePath: "docs/result.md",
            title: "Result",
          },
        ],
      })),
    };
    const toolCalls = [
      {
        function: {
          arguments: "{\"query\":\"release notes\"}",
          name: "kb_searchLocal",
        },
        id: "call-1",
        type: "function",
      },
    ];
    const llmClient = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          metadata: { finishReason: "tool_calls", model: "gpt-4.1-mini", provider: "openai", toolCalls: 1 },
          role: "assistant",
          text: "",
          toolCalls,
        },
        ok: true,
      })
      .mockResolvedValueOnce({
        data: {
          metadata: { finishReason: "stop", model: "gpt-4.1-mini", provider: "openai", toolCalls: 0 },
          role: "assistant",
          text: "Final answer from the searched result.",
        },
        ok: true,
      });
    const toolEvents = [];

    const result = await runAgentLoop(
      {
        llmClient,
        provider,
        requestId: "loop-test",
        userText: "Find release notes",
      },
      {
        onToolCall: (event) => toolEvents.push(event),
      },
    );

    expect(llmClient).toHaveBeenCalledTimes(2);
    expect(llmClient.mock.calls[0][0]).toMatchObject({
      tool_choice: "auto",
      tools: expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "kb_searchLocal" }),
          type: "function",
        }),
      ]),
    });
    expect(llmClient.mock.calls[1][0].messages).toEqual(expect.arrayContaining([
      { content: null, role: "assistant", tool_calls: toolCalls },
      expect.objectContaining({ role: "tool", tool_call_id: "call-1" }),
    ]));
    expect(provider.searchKnowledgeLocal).toHaveBeenCalledWith("release notes");
    expect(result).toMatchObject({
      content: "Final answer from the searched result.",
      finishReason: "stop",
      rounds: 2,
      totalToolCalls: 1,
      toolCallHistory: [
        expect.objectContaining({
          state: "completed",
          toolId: "kb.searchLocal",
        }),
      ],
    });
    expect(toolEvents).toEqual([
      expect.objectContaining({ round: 1, state: "running", toolId: "kb.searchLocal" }),
      expect.objectContaining({ round: 1, state: "completed", toolId: "kb.searchLocal" }),
    ]);
  });
});
