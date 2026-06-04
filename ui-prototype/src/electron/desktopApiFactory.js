import { IPC_METHODS, IPC_STREAM_CHANNELS, IPC_WINDOW_CHANNELS } from "./ipcChannels.js";
import { unwrapApiResult } from "./apiResult.js";

const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*=\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function redactStreamText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]");
}

function sanitizeStreamEvent(event = {}) {
  const metadata = event.metadata && typeof event.metadata === "object"
    ? {
        ...(event.metadata.completionId ? { completionId: redactStreamText(String(event.metadata.completionId)) } : {}),
        ...(event.metadata.finishReason ? { finishReason: redactStreamText(String(event.metadata.finishReason)) } : {}),
        ...(event.metadata.model ? { model: redactStreamText(String(event.metadata.model)) } : {}),
        ...(event.metadata.provider ? { provider: redactStreamText(String(event.metadata.provider)) } : {}),
        ...(Number.isFinite(event.metadata.toolCalls) ? { toolCalls: event.metadata.toolCalls } : {}),
      }
    : null;

  return {
    ...(event.error && typeof event.error === "object"
      ? {
          error: {
            code: cleanString(event.error.code) || "UNKNOWN_ERROR",
            message: redactStreamText(cleanString(event.error.message) || "Local operation failed"),
            retryable: Boolean(event.error.retryable),
          },
        }
      : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    requestId: cleanString(event.requestId),
    ...(event.status ? { status: cleanString(event.status) } : {}),
    ...(typeof event.text === "string" ? { text: redactStreamText(event.text) } : {}),
    ...(typeof event.token === "string" ? { token: redactStreamText(event.token) } : {}),
    type: cleanString(event.type) || "token",
  };
}

export function createDesktopApi(ipcRenderer, options = {}) {
  const api = IPC_METHODS.reduce((api, item) => {
    const invoke = async (...args) => {
      const result = await ipcRenderer.invoke(item.channel, ...args);
      return options.unwrapResults ? unwrapApiResult(result) : result;
    };

    return {
      ...api,
      [item.namespace]: {
        ...(api[item.namespace] ?? {}),
        [item.method]: invoke,
      },
    };
  }, {});

  return {
    ...api,
    agentChat: {
      ...(api.agentChat ?? {}),
      onStreamEvent(requestId, callback) {
        const expectedRequestId = cleanString(requestId);
        const listener = (_event, payload) => {
          const safeEvent = sanitizeStreamEvent(payload);
          if (safeEvent.requestId !== expectedRequestId) {
            return;
          }
          callback(safeEvent);
        };

        ipcRenderer.on(IPC_STREAM_CHANNELS.agentChat.message, listener);
        return () => ipcRenderer.removeListener(IPC_STREAM_CHANNELS.agentChat.message, listener);
      },
    },
    window: {
      close: () => ipcRenderer.send(IPC_WINDOW_CHANNELS.close),
      maximize: () => ipcRenderer.send(IPC_WINDOW_CHANNELS.maximize),
      minimize: () => ipcRenderer.send(IPC_WINDOW_CHANNELS.minimize),
    },
  };
}
