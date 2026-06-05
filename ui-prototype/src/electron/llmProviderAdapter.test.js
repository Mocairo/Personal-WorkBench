import { describe, expect, it, vi } from "vitest";
import {
  getLlmProviderStatus,
  listLlmModels,
  listLlmProviders,
  sendLlmTextMessage,
  streamLlmTextMessage,
  validateProviderConfig,
} from "./llmProviderAdapter";

function createSseResponse(chunks) {
  const encoder = new TextEncoder();

  return {
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    ok: true,
    status: 200,
  };
}

describe("LLM provider adapter", () => {
  it("returns unconfigured provider and model status by default", async () => {
    await expect(listLlmProviders()).resolves.toEqual([
      expect.objectContaining({
        hasSecret: false,
        id: "openai-compatible",
        provider: "openai-compatible",
        status: "unconfigured",
      }),
    ]);
    await expect(listLlmModels()).resolves.toEqual([
      expect.objectContaining({
        model: "not configured",
        provider: "openai-compatible",
        status: "unconfigured",
      }),
    ]);
    await expect(getLlmProviderStatus()).resolves.toMatchObject({
      hasSecret: false,
      provider: "openai-compatible",
      status: "unconfigured",
    });
  });

  it("sanitizes configured provider data and never exposes API keys", async () => {
    const providers = await listLlmProviders({
      providers: [
        {
          apiKey: "sk-real-secret",
          id: "openai",
          label: "OpenAI",
          model: "gpt-4.1-mini",
          provider: "openai",
          secretHint: "sk-real-secret",
          status: "ready",
        },
      ],
    });

    expect(providers).toEqual([
      expect.objectContaining({
        hasSecret: true,
        id: "openai",
        provider: "openai",
        secretHint: "[redacted]",
        status: "ready",
      }),
    ]);
    expect(JSON.stringify(providers)).not.toMatch(/sk-real-secret|apiKey/);
  });

  it("validates provider config as dry-run without calling a remote API", async () => {
    let networkCalled = false;
    const result = await validateProviderConfig(
      {
        apiKey: "sk-dry-run-secret",
        model: "gpt-4.1-mini",
        provider: "openai",
      },
      {
        networkClient() {
          networkCalled = true;
        },
      },
    );

    expect(networkCalled).toBe(false);
    expect(result).toMatchObject({
      dryRun: true,
      provider: "openai",
      status: "ready",
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-dry-run-secret|apiKey/);
  });

  it("does not call transport when the provider is unconfigured", async () => {
    const transport = vi.fn();

    await expect(sendLlmTextMessage(
      { userText: "Hello" },
      {
        config: {
          apiKey: "",
          model: "not configured",
          provider: "",
        },
        transport,
      },
    )).resolves.toMatchObject({
      error: {
        code: "PROVIDER_NOT_CONFIGURED",
      },
      ok: false,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not call transport when the provider secret is missing", async () => {
    const transport = vi.fn();

    await expect(sendLlmTextMessage(
      { userText: "Hello" },
      {
        config: {
          apiKey: "",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        transport,
      },
    )).resolves.toMatchObject({
      error: {
        code: "LLM_SECRET_MISSING",
      },
      ok: false,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends a non-streaming OpenAI-compatible text request with context summary and returns assistant text", async () => {
    const transport = vi.fn(async () => ({
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "A concise model reply.",
              role: "assistant",
            },
          },
        ],
        id: "chatcmpl-test",
        model: "gpt-4.1-mini",
        usage: {
          completion_tokens: 5,
          prompt_tokens: 21,
          total_tokens: 26,
        },
      }),
      ok: true,
      status: 200,
    }));

    const result = await sendLlmTextMessage(
      {
        contextPack: {
          items: [
            {
              excerpt: "Only local docs are attached.",
              sourceType: "kb",
              title: "Docs",
            },
          ],
        },
        userText: "Summarize the workspace",
      },
      {
        config: {
          apiKey: "sk-send-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        transport,
      },
    );

    expect(result).toMatchObject({
      data: {
        metadata: {
          finishReason: "stop",
          model: "gpt-4.1-mini",
          provider: "openai",
          toolCalls: 0,
        },
        role: "assistant",
        text: "A concise model reply.",
      },
      ok: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://gateway.example.test/v1/chat/completions");
    expect(transport.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-send-secret");
    const requestBody = JSON.parse(transport.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: "gpt-4.1-mini",
      stream: false,
      tool_choice: "none",
    });
    expect(JSON.stringify(requestBody.messages)).toContain("Summarize the workspace");
    expect(JSON.stringify(requestBody.messages)).toContain("Only local docs are attached.");
    expect(JSON.stringify(result)).not.toMatch(/sk-send-secret|apiKey|Authorization/);
  });

  it("uses prebuilt sanitized messages when the main process provides LLM context", async () => {
    const transport = vi.fn(async () => ({
      json: async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "Context-aware reply.",
              role: "assistant",
            },
          },
        ],
        id: "chatcmpl-context-test",
        model: "gpt-4.1-mini",
      }),
      ok: true,
      status: 200,
    }));

    await sendLlmTextMessage(
      {
        messages: [
          { role: "system", content: "Use bounded local context." },
          { role: "user", content: "Earlier session says Settings overlay stays put." },
          { role: "assistant", content: "I remember the overlay constraint." },
          { role: "user", content: "Final question apiKey=sk-user-secret D:\\private\\prompt.txt" },
        ],
        userText: "This fallback text should not be sent.",
      },
      {
        config: {
          apiKey: "sk-send-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        transport,
      },
    );

    const requestBody = JSON.parse(transport.mock.calls[0][1].body);
    expect(requestBody.messages).toEqual([
      { role: "system", content: "Use bounded local context." },
      { role: "user", content: "Earlier session says Settings overlay stays put." },
      { role: "assistant", content: "I remember the overlay constraint." },
      { role: "user", content: "Final question [redacted] [redacted-path]" },
    ]);
    expect(JSON.stringify(requestBody.messages)).not.toContain("This fallback text should not be sent.");
    expect(JSON.stringify(requestBody.messages)).not.toMatch(/sk-user-secret|apiKey|D:\\private|Authorization/);
  });

  it("wraps provider API failures as ApiResult errors without leaking secrets", async () => {
    const transport = vi.fn(async () => ({
      json: async () => ({
        error: {
          message: "Invalid API key: sk-failed-secret",
          type: "invalid_request_error",
        },
      }),
      ok: false,
      status: 401,
    }));

    const result = await sendLlmTextMessage(
      { userText: "Hello" },
      {
        config: {
          apiKey: "sk-failed-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        transport,
      },
    );

    expect(result).toMatchObject({
      error: {
        code: "LLM_REQUEST_FAILED",
        retryable: false,
      },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-failed-secret|apiKey|Authorization/);
  });

  it("streams OpenAI-compatible text chunks as sanitized token events", async () => {
    const events = [];
    const transport = vi.fn(async () => createSseResponse([
      'data: {"id":"chatcmpl-stream","model":"gpt-4.1-mini","choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"id":"chatcmpl-stream","model":"gpt-4.1-mini","choices":[{"delta":{"content":"there"}}]}\n\n',
      'data: {"id":"chatcmpl-stream","model":"gpt-4.1-mini","choices":[{"finish_reason":"stop","delta":{}}]}\n\n',
      "data: [DONE]\n\n",
    ]));

    const result = await streamLlmTextMessage(
      { requestId: "stream-1", userText: "Say hello token=sk-user-secret" },
      {
        config: {
          apiKey: "sk-stream-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        onEvent: (event) => events.push(event),
        transport,
      },
    );

    expect(result).toMatchObject({
      data: {
        metadata: {
          finishReason: "stop",
          model: "gpt-4.1-mini",
          provider: "openai",
          toolCalls: 0,
        },
        role: "assistant",
        text: "Hello there",
      },
      ok: true,
    });
    expect(events).toEqual([
      expect.objectContaining({ requestId: "stream-1", status: "generating", type: "start" }),
      expect.objectContaining({ requestId: "stream-1", text: "Hello ", token: "Hello ", type: "token" }),
      expect.objectContaining({ requestId: "stream-1", text: "Hello there", token: "there", type: "token" }),
      expect.objectContaining({ requestId: "stream-1", status: "done", text: "Hello there", type: "done" }),
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(transport.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: "gpt-4.1-mini",
      stream: true,
      tool_choice: "none",
    });
    expect(JSON.stringify(events)).not.toMatch(/sk-stream-secret|sk-user-secret|apiKey|Authorization/);
  });

  it("stops streaming after cancel and emits a cancelled event", async () => {
    const events = [];
    const abortController = new AbortController();
    const transport = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" second"}}]}\n\n',
      "data: [DONE]\n\n",
    ]));

    const result = await streamLlmTextMessage(
      { requestId: "stream-cancel", userText: "Hello" },
      {
        abortSignal: abortController.signal,
        config: {
          apiKey: "sk-stream-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        onEvent: (event) => {
          events.push(event);
          if (event.type === "token") {
            abortController.abort();
          }
        },
        transport,
      },
    );

    expect(result).toMatchObject({
      data: {
        status: "cancelled",
        text: "first",
      },
      ok: true,
    });
    expect(events).toEqual([
      expect.objectContaining({ type: "start" }),
      expect.objectContaining({ text: "first", token: "first", type: "token" }),
      expect.objectContaining({ status: "cancelled", text: "first", type: "cancelled" }),
    ]);
  });

  it("emits an error event and does not call transport when streaming provider is unconfigured", async () => {
    const events = [];
    const transport = vi.fn();

    const result = await streamLlmTextMessage(
      { requestId: "stream-unconfigured", userText: "Hello" },
      {
        config: {
          apiKey: "",
          model: "not configured",
          provider: "",
        },
        onEvent: (event) => events.push(event),
        transport,
      },
    );

    expect(result).toMatchObject({
      error: {
        code: "PROVIDER_NOT_CONFIGURED",
      },
      ok: false,
    });
    expect(events).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: "PROVIDER_NOT_CONFIGURED" }),
        requestId: "stream-unconfigured",
        type: "error",
      }),
    ]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("emits an error event and does not call transport when streaming secret is missing", async () => {
    const events = [];
    const transport = vi.fn();

    const result = await streamLlmTextMessage(
      { requestId: "stream-missing-secret", userText: "Hello" },
      {
        config: {
          apiKey: "",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        onEvent: (event) => events.push(event),
        transport,
      },
    );

    expect(result).toMatchObject({
      error: {
        code: "LLM_SECRET_MISSING",
      },
      ok: false,
    });
    expect(events).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: "LLM_SECRET_MISSING" }),
        requestId: "stream-missing-secret",
        type: "error",
      }),
    ]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("wraps streaming transport errors as sanitized error events", async () => {
    const events = [];
    const transport = vi.fn(async () => {
      throw new Error("Network failed with sk-stream-secret");
    });

    const result = await streamLlmTextMessage(
      { requestId: "stream-error", userText: "Hello" },
      {
        config: {
          apiKey: "sk-stream-secret",
          baseUrl: "https://gateway.example.test/v1",
          model: "gpt-4.1-mini",
          provider: "openai",
        },
        onEvent: (event) => events.push(event),
        transport,
      },
    );

    expect(result).toMatchObject({
      error: {
        code: "LLM_REQUEST_FAILED",
        retryable: true,
      },
      ok: false,
    });
    expect(events).toEqual([
      expect.objectContaining({ type: "start" }),
      expect.objectContaining({
        error: expect.objectContaining({ code: "LLM_REQUEST_FAILED" }),
        requestId: "stream-error",
        type: "error",
      }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/sk-stream-secret|apiKey|Authorization/);
  });
});
