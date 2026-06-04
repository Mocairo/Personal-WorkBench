import {
  buildLlmModelProfile,
  buildLlmProviderProfile,
  buildSecretStatus,
  redactSecretText,
} from "../shared/llmSecurityContracts.js";
import { fail, ok } from "./apiResult.js";
import { loadLlmConfig } from "./llmEnvLoader.js";

const DEFAULT_PROVIDER = {
  id: "openai-compatible",
  label: "OpenAI-compatible",
  message: "Configure a provider before enabling Agent runtime.",
  model: "not configured",
  provider: "openai-compatible",
  status: "unconfigured",
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const STREAM_SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*=\s*[^\s,;]+/gi;
const STREAM_AUTHORIZATION_PATTERN = /\b(Authorization:\s*Bearer\s+)[^\s,;]+/gi;
const STREAM_OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const STREAM_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;

function getProviderInputs(options = {}) {
  return Array.isArray(options.providers) && options.providers.length > 0
    ? options.providers
    : [DEFAULT_PROVIDER];
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function redactStreamText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(STREAM_AUTHORIZATION_PATTERN, "$1[redacted]")
    .replace(STREAM_SECRET_ASSIGNMENT_PATTERN, (match) => `${match.split("=")[0]}=[redacted]`)
    .replace(STREAM_OPENAI_KEY_PATTERN, "[redacted]")
    .replace(STREAM_WINDOWS_PATH_PATTERN, "[redacted-path]");
}

function normalizeConfig(config = {}) {
  const provider = cleanString(config.provider);
  const model = cleanString(config.model);
  const apiKey = cleanString(config.apiKey);
  const baseUrl = cleanString(config.baseUrl) || DEFAULT_BASE_URL;
  const status = cleanString(config.status) || (
    provider && model && model !== "not configured"
      ? apiKey
        ? "ready"
        : "missing_secret"
      : "unconfigured"
  );

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    hasSecret: Boolean(apiKey),
    model,
    provider,
    status,
  };
}

async function resolveSendConfig(options = {}) {
  if (options.config) {
    return normalizeConfig(options.config);
  }

  return normalizeConfig(await loadLlmConfig({
    envPath: options.envPath,
    processEnv: options.processEnv,
  }));
}

function buildContextSummary(contextPack = {}) {
  const items = Array.isArray(contextPack.items) ? contextPack.items : [];
  if (items.length === 0) {
    return "No context pack items were attached.";
  }

  return items.slice(0, 8).map((item, index) => {
    const title = cleanString(item.title ?? item.label ?? item.relativePath) || `Context ${index + 1}`;
    const type = cleanString(item.type ?? item.sourceType ?? item.source) || "context";
    const excerpt = cleanString(item.excerpt ?? item.preview ?? item.summary);

    return `- ${title} (${type})${excerpt ? `: ${excerpt}` : ""}`;
  }).join("\n");
}

function buildTextMessages(input = {}) {
  const userText = redactSecretText(cleanString(input.userText ?? input.text ?? input.message));
  const contextSummary = redactSecretText(buildContextSummary(input.contextPack));

  return [
    {
      content: [
        "You are the local desktop Agent Chat assistant.",
        "Use only the user message and Context Pack summary below.",
        "Do not request, plan, or execute tools.",
      ].join(" "),
      role: "system",
    },
    {
      content: `Context Pack Summary:\n${contextSummary}\n\nUser Message:\n${userText}`,
      role: "user",
    },
  ];
}

function extractResponseText(payload = {}) {
  const content = payload.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => cleanString(part.text ?? part.content)).filter(Boolean).join("\n");
  }

  return cleanString(content);
}

function extractStreamToken(payload = {}) {
  const content = payload.choices?.[0]?.delta?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof (part.text ?? part.content) === "string" ? (part.text ?? part.content) : "")
      .join("");
  }

  return typeof content === "string" ? content : "";
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function buildLlmErrorEvent(requestId, result) {
  return {
    error: result.error,
    requestId,
    status: "error",
    type: "error",
  };
}

function emitStreamEvent(onEvent, event) {
  if (typeof onEvent !== "function") {
    return;
  }

  onEvent(event);
}

async function* readResponseTextChunks(body) {
  const decoder = new TextDecoder();

  if (!body) {
    return;
  }

  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield decoder.decode(value, { stream: true });
      }
      const tail = decoder.decode();
      if (tail) {
        yield tail;
      }
    } finally {
      reader.releaseLock?.();
    }
    return;
  }

  if (typeof body[Symbol.asyncIterator] === "function") {
    for await (const chunk of body) {
      yield typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) {
      yield tail;
    }
  }
}

function parseSseBuffer(buffer) {
  const events = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (data) {
      events.push(data);
    }
  }

  return { events, remainder };
}

function buildStreamMetadata({ config, finishReason, payload } = {}) {
  return {
    completionId: redactSecretText(payload?.id),
    finishReason: redactSecretText(finishReason),
    model: redactSecretText(payload?.model ?? config?.model),
    provider: redactSecretText(config?.provider),
    toolCalls: 0,
  };
}

function validateSendConfig(config, transport) {
  if (!config.provider || config.status === "unconfigured") {
    return fail({
      code: "PROVIDER_NOT_CONFIGURED",
      message: "LLM provider is not configured.",
      retryable: false,
    });
  }

  if (!config.model || config.model === "not configured") {
    return fail({
      code: "PROVIDER_NOT_CONFIGURED",
      message: "LLM model is not configured.",
      retryable: false,
    });
  }

  if (!config.apiKey) {
    return fail({
      code: "LLM_SECRET_MISSING",
      message: "LLM provider secret is not configured.",
      retryable: false,
    });
  }

  if (typeof transport !== "function") {
    return fail({
      code: "SERVICE_UNAVAILABLE",
      message: "LLM transport is not available.",
      retryable: true,
    });
  }

  return null;
}

export async function listLlmProviders(options = {}) {
  return getProviderInputs(options).map(buildLlmProviderProfile);
}

export async function listLlmModels(options = {}) {
  return getProviderInputs(options).map((provider) => buildLlmModelProfile({
    ...provider,
    model: provider.model ?? provider.defaultModel ?? "not configured",
  }));
}

export async function getLlmProviderStatus(options = {}) {
  return (await listLlmProviders(options))[0];
}

export async function listLlmSecretStatuses(options = {}) {
  return getProviderInputs(options).map((provider) => buildSecretStatus({
    ...provider,
    id: `${provider.id ?? provider.provider ?? "llm-provider"}-secret`,
    label: `${provider.label ?? provider.provider ?? "LLM Provider"} Secret`,
  }));
}

export async function validateProviderConfig(config = {}, options = {}) {
  void options.networkClient;
  const profile = buildLlmProviderProfile({
    ...config,
    status: config.provider && (config.hasSecret || config.secretHint || config.apiKey || config.token)
      ? "ready"
      : "unconfigured",
  });

  return {
    dryRun: true,
    hasSecret: profile.hasSecret,
    message: redactSecretText(profile.message),
    model: profile.model,
    provider: profile.provider,
    secretHint: profile.secretHint,
    status: profile.status,
    updatedAt: profile.updatedAt,
  };
}

export async function sendLlmTextMessage(input = {}, options = {}) {
  const config = await resolveSendConfig(options);
  const transport = options.transport ?? globalThis.fetch;
  const validationError = validateSendConfig(config, transport);
  if (validationError) {
    return validationError;
  }

  try {
    const response = await transport(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        messages: buildTextMessages(input),
        model: config.model,
        stream: false,
        tool_choice: "none",
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      return fail({
        code: "LLM_REQUEST_FAILED",
        detail: redactSecretText(payload.error?.message),
        message: "LLM request failed.",
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      });
    }

    const text = extractResponseText(payload);
    if (!text) {
      return fail({
        code: "LLM_EMPTY_RESPONSE",
        message: "LLM response did not include assistant text.",
        retryable: true,
      });
    }

    return ok({
      metadata: {
        completionId: redactSecretText(payload.id),
        finishReason: redactSecretText(payload.choices?.[0]?.finish_reason),
        model: redactSecretText(payload.model ?? config.model),
        provider: redactSecretText(config.provider),
        toolCalls: 0,
        usage: payload.usage
          ? {
              completionTokens: payload.usage.completion_tokens,
              promptTokens: payload.usage.prompt_tokens,
              totalTokens: payload.usage.total_tokens,
            }
          : null,
      },
      role: "assistant",
      text: redactSecretText(text),
    });
  } catch (error) {
    return fail({
      code: "LLM_REQUEST_FAILED",
      detail: redactSecretText(error?.message),
      message: "LLM request failed.",
      retryable: true,
    });
  }
}

export async function streamLlmTextMessage(input = {}, options = {}) {
  const requestId = cleanString(input.requestId) || `llm-stream-${Date.now()}`;
  const config = await resolveSendConfig(options);
  const transport = options.transport ?? globalThis.fetch;
  const validationError = validateSendConfig(config, transport);

  if (validationError) {
    emitStreamEvent(options.onEvent, buildLlmErrorEvent(requestId, validationError));
    return validationError;
  }

  let text = "";
  let finishReason = "";
  let latestPayload = null;

  const metadata = () => buildStreamMetadata({
    config,
    finishReason,
    payload: latestPayload,
  });

  emitStreamEvent(options.onEvent, {
    metadata: metadata(),
    requestId,
    status: "generating",
    type: "start",
  });

  try {
    const response = await transport(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        messages: buildTextMessages(input),
        model: config.model,
        stream: true,
        tool_choice: "none",
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const payload = await readJsonResponse(response);
      const result = fail({
        code: "LLM_REQUEST_FAILED",
        detail: redactSecretText(payload.error?.message),
        message: "LLM request failed.",
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      });
      emitStreamEvent(options.onEvent, buildLlmErrorEvent(requestId, result));
      return result;
    }

    let buffer = "";
    for await (const chunk of readResponseTextChunks(response.body)) {
      buffer += chunk;
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.remainder;

      for (const eventData of parsed.events) {
        if (eventData === "[DONE]") {
          continue;
        }

        let payload = null;
        try {
          payload = JSON.parse(eventData);
        } catch {
          const result = fail({
            code: "LLM_STREAM_ERROR",
            message: "LLM stream event could not be parsed.",
            retryable: true,
          });
          emitStreamEvent(options.onEvent, buildLlmErrorEvent(requestId, result));
          return result;
        }

        latestPayload = payload;
        finishReason = cleanString(payload.choices?.[0]?.finish_reason) || finishReason;

        const token = redactStreamText(extractStreamToken(payload));
        if (token) {
          text = redactStreamText(`${text}${token}`);
          emitStreamEvent(options.onEvent, {
            metadata: metadata(),
            requestId,
            status: "generating",
            text,
            token,
            type: "token",
          });
        }

        if (options.abortSignal?.aborted) {
          emitStreamEvent(options.onEvent, {
            metadata: metadata(),
            requestId,
            status: "cancelled",
            text,
            type: "cancelled",
          });
          return ok({
            metadata: metadata(),
            role: "assistant",
            status: "cancelled",
            text,
          });
        }
      }

      if (options.abortSignal?.aborted) {
        emitStreamEvent(options.onEvent, {
          metadata: metadata(),
          requestId,
          status: "cancelled",
          text,
          type: "cancelled",
        });
        return ok({
          metadata: metadata(),
          role: "assistant",
          status: "cancelled",
          text,
        });
      }
    }

    if (options.abortSignal?.aborted) {
      emitStreamEvent(options.onEvent, {
        metadata: metadata(),
        requestId,
        status: "cancelled",
        text,
        type: "cancelled",
      });
      return ok({
        metadata: metadata(),
        role: "assistant",
        status: "cancelled",
        text,
      });
    }

    if (!text) {
      const result = fail({
        code: "LLM_EMPTY_RESPONSE",
        message: "LLM response did not include assistant text.",
        retryable: true,
      });
      emitStreamEvent(options.onEvent, buildLlmErrorEvent(requestId, result));
      return result;
    }

    emitStreamEvent(options.onEvent, {
      metadata: metadata(),
      requestId,
      status: "done",
      text,
      type: "done",
    });

    return ok({
      metadata: metadata(),
      role: "assistant",
      text,
    });
  } catch (error) {
    if (options.abortSignal?.aborted || error?.name === "AbortError") {
      emitStreamEvent(options.onEvent, {
        metadata: metadata(),
        requestId,
        status: "cancelled",
        text,
        type: "cancelled",
      });
      return ok({
        metadata: metadata(),
        role: "assistant",
        status: "cancelled",
        text,
      });
    }

    const result = fail({
      code: "LLM_REQUEST_FAILED",
      detail: redactSecretText(error?.message),
      message: "LLM request failed.",
      retryable: true,
    });
    emitStreamEvent(options.onEvent, buildLlmErrorEvent(requestId, result));
    return result;
  }
}
