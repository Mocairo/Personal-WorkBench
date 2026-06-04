import * as mockProvider from "../services/mockProvider.js";
import { errorToApiResult, isApiResult, notImplemented, ok, permissionDenied } from "./apiResult.js";
import { IPC_METHODS, IPC_WINDOW_CHANNELS } from "./ipcChannels.js";

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

function defaultStreamStatus(type) {
  if (type === "done") {
    return "done";
  }
  if (type === "cancelled") {
    return "cancelled";
  }
  if (type === "error") {
    return "error";
  }
  return "generating";
}

function sanitizeStreamMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const safeMetadata = {};
  for (const key of ["completionId", "finishReason", "model", "provider"]) {
    if (metadata[key]) {
      safeMetadata[key] = redactStreamText(String(metadata[key]));
    }
  }
  if (Number.isFinite(metadata.toolCalls)) {
    safeMetadata.toolCalls = metadata.toolCalls;
  }

  return Object.keys(safeMetadata).length > 0 ? safeMetadata : null;
}

function sanitizeStreamEvent(event = {}) {
  const type = cleanString(event.type) || "token";
  const metadata = sanitizeStreamMetadata(event.metadata);

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
    ...(metadata ? { metadata } : {}),
    requestId: cleanString(event.requestId),
    status: cleanString(event.status) || defaultStreamStatus(type),
    ...(typeof event.text === "string" ? { text: redactStreamText(event.text) } : {}),
    ...(typeof event.token === "string" ? { token: redactStreamText(event.token) } : {}),
    type,
  };
}

async function invokeProviderMethod(provider, item, args, event) {
  if (item.permission === "denied") {
    return permissionDenied(item.message);
  }

  if (item.permission === "notImplemented") {
    return notImplemented(item.message);
  }

  const handler = provider[item.providerMethod];

  if (typeof handler !== "function") {
    return notImplemented(`${item.providerMethod} is not available in phase 1.`);
  }

  try {
    const invokeArgs = item.eventChannel
      ? [
          args[0] ?? {},
          {
            onEvent(streamEvent) {
              event?.sender?.send?.(item.eventChannel, sanitizeStreamEvent(streamEvent));
            },
          },
        ]
      : args;
    const result = await handler(...invokeArgs);
    return isApiResult(result) ? result : ok(result);
  } catch (error) {
    return errorToApiResult(error);
  }
}

export function createIpcHandlerMap(provider = mockProvider) {
  return IPC_METHODS.reduce((handlers, item) => {
    return {
      ...handlers,
      [item.channel]: (event, ...args) => invokeProviderMethod(provider, item, args, event),
    };
  }, {});
}

export function registerIpcHandlers(ipcMain, provider = mockProvider) {
  const handlers = createIpcHandlerMap(provider);

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

function getWindowFromEvent(event, browserWindow) {
  return browserWindow.fromWebContents(event.sender);
}

export function registerWindowControlHandlers(ipcMain, browserWindow) {
  ipcMain.on(IPC_WINDOW_CHANNELS.minimize, (event) => {
    const window = getWindowFromEvent(event, browserWindow);
    window?.minimize();
  });

  ipcMain.on(IPC_WINDOW_CHANNELS.maximize, (event) => {
    const window = getWindowFromEvent(event, browserWindow);

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });

  ipcMain.on(IPC_WINDOW_CHANNELS.close, (event) => {
    const window = getWindowFromEvent(event, browserWindow);
    window?.close();
  });
}
