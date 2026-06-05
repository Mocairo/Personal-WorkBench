import crypto from "node:crypto";
import { spawn as defaultSpawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, ok } from "./apiResult.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_FAKE_MODEL = "fake-embedding";
const DEFAULT_LOCAL_BGE_MODEL = "bge-m3";
const DEFAULT_LOCAL_BGE_MODEL_PATH = "D:\\models\\bge-m3";
const DEFAULT_MAX_INPUT_CHARS = 1600;
const DEFAULT_LOCAL_TIMEOUT_MS = 120_000;
const DEFAULT_LOCAL_MAX_BATCH_SIZE = 8;
const FAKE_DIMENSIONS = 12;
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;
const UNIX_PRIVATE_PATH_PATTERN = /(^|\s)\/(?:Users|home|var|tmp|mnt|Volumes)\/[^\s"']+/g;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function redactEmbeddingText(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text
    .replace(AUTHORIZATION_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(OPENAI_KEY_PATTERN, "[redacted]")
    .replace(WINDOWS_PATH_PATTERN, "[redacted-path]")
    .replace(UNIX_PRIVATE_PATH_PATTERN, "$1[redacted-path]");
}

function limitEmbeddingText(value, maxChars = DEFAULT_MAX_INPUT_CHARS) {
  const text = redactEmbeddingText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeConfig(config = {}) {
  const provider = cleanString(config.provider);
  const model = cleanString(config.model);
  const apiKey = cleanString(config.apiKey ?? config.token ?? config.secret);
  const baseUrl = cleanString(config.baseUrl) || DEFAULT_BASE_URL;
  const status = cleanString(config.status);

  if (provider === "fake" || provider === "deterministic") {
    return {
      apiKey: "",
      baseUrl: baseUrl.replace(/\/+$/, ""),
      model: model || DEFAULT_FAKE_MODEL,
      provider: "fake",
      status: "ready",
    };
  }

  if (provider === "local-bge-m3" || provider === "bge-m3") {
    return {
      apiKey: "",
      baseUrl: "",
      model: model || DEFAULT_LOCAL_BGE_MODEL,
      modelPath: cleanString(config.modelPath) || DEFAULT_LOCAL_BGE_MODEL_PATH,
      provider: "local-bge-m3",
      pythonPath: cleanString(config.pythonPath),
      status: status || "pending_model_check",
    };
  }

  const inferredStatus = provider && model
    ? apiKey
      ? "ready"
      : "missing_secret"
    : "unconfigured";

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    provider,
    status: status || inferredStatus,
  };
}

function getLocalBgeScriptPath() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../scripts/embed_bge_m3.py");
}

async function pathExists(targetPath) {
  if (!targetPath) {
    return false;
  }

  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function providerErrorForStatus(config) {
  if (config.provider === "local-bge-m3") {
    return null;
  }

  if (!config.provider || config.status === "unconfigured") {
    return fail({
      code: "EMBEDDING_PROVIDER_UNCONFIGURED",
      message: "Embedding provider is not configured.",
      retryable: false,
    });
  }

  if (!config.model) {
    return fail({
      code: "EMBEDDING_PROVIDER_UNCONFIGURED",
      message: "Embedding model is not configured.",
      retryable: false,
    });
  }

  if (!config.apiKey) {
    return fail({
      code: "EMBEDDING_SECRET_MISSING",
      message: "Embedding provider secret is not configured.",
      retryable: false,
    });
  }

  return null;
}

function normalizeInputs(input = [], maxInputChars = DEFAULT_MAX_INPUT_CHARS) {
  const items = Array.isArray(input) ? input : [input];
  return items
    .map((item) => limitEmbeddingText(item, maxInputChars))
    .filter(Boolean);
}

function deterministicEmbedding(text = "", dimensions = FAKE_DIMENSIONS) {
  const hash = crypto.createHash("sha256").update(String(text)).digest();
  const vector = [];

  for (let index = 0; index < dimensions; index += 1) {
    const byte = hash[index % hash.length];
    vector.push(Number(((byte - 128) / 128).toFixed(6)));
  }

  return vector;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function retryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function normalizeEmbeddingVector(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => Number(item))
    .filter(Number.isFinite);
}

function sanitizeMetadata(config = {}, payload = {}) {
  return {
    dimension: Number.isFinite(Number(payload.dimension)) ? Number(payload.dimension) : undefined,
    elapsed: Number.isFinite(Number(payload.elapsed)) ? Number(payload.elapsed) : undefined,
    model: redactEmbeddingText(payload.model ?? config.model),
    provider: redactEmbeddingText(config.provider),
  };
}

function coercePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function runtimeProviderStatus(code) {
  const normalized = cleanString(code).toLowerCase();
  if (normalized === "missing_dependency") {
    return "missing_dependency";
  }
  if (normalized === "missing_model") {
    return "missing_model";
  }
  return "unavailable";
}

function failLocalEmbedding({ code, detail, message, providerStatus }) {
  const result = fail({
    code,
    detail: redactEmbeddingText(detail),
    message,
    retryable: providerStatus !== "missing_model",
  });

  return {
    ...result,
    error: {
      ...result.error,
      providerStatus,
    },
  };
}

function normalizeRuntimeEmbeddings(value) {
  return (Array.isArray(value) ? value : [])
    .map((embedding) => normalizeEmbeddingVector(embedding))
    .filter((embedding) => embedding.length > 0);
}

function runLocalBgeRuntime(texts, config, options = {}) {
  return new Promise((resolve) => {
    const spawn = options.spawn ?? defaultSpawn;
    const pythonPath = cleanString(options.pythonPath) || config.pythonPath || "python";
    const maxBatchSize = coercePositiveInteger(options.maxBatchSize, DEFAULT_LOCAL_MAX_BATCH_SIZE);
    const maxInputChars = coercePositiveInteger(options.maxInputChars, DEFAULT_MAX_INPUT_CHARS);
    const timeoutMs = coercePositiveInteger(options.timeoutMs, DEFAULT_LOCAL_TIMEOUT_MS);
    const args = [
      getLocalBgeScriptPath(),
      "--model-path",
      config.modelPath,
      "--max-input-chars",
      String(maxInputChars),
      "--max-batch-size",
      String(maxBatchSize),
    ];
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };

    let child;
    try {
      child = spawn(pythonPath, args, {
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      finish({
        ok: false,
        error: {
          code: "runtime_error",
          message: error?.message || "Unable to start local embedding runtime.",
        },
      });
      return;
    }

    const timeout = setTimeout(() => {
      if (typeof child.kill === "function") {
        child.kill();
      }
      finish({
        ok: false,
        error: {
          code: "timeout",
          message: "Local embedding runtime timed out.",
        },
      });
    }, timeoutMs);

    child.stdout?.on?.("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on?.("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on?.("error", (error) => {
      clearTimeout(timeout);
      finish({
        ok: false,
        error: {
          code: "runtime_error",
          message: error?.message || "Local embedding runtime failed.",
        },
      });
    });
    child.on?.("close", (exitCode) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }

      if (exitCode !== 0 && !stdout.trim()) {
        finish({
          ok: false,
          error: {
            code: "runtime_error",
            message: stderr || "Local embedding runtime exited without a result.",
          },
        });
        return;
      }

      try {
        finish(JSON.parse(stdout || "{}"));
      } catch {
        finish({
          ok: false,
          error: {
            code: "runtime_error",
            message: "Local embedding runtime returned invalid JSON.",
          },
        });
      }
    });

    child.stdin?.write?.(Buffer.from(JSON.stringify({ texts }), "utf8"));
    child.stdin?.end?.();
  });
}

async function embedLocalBgeTexts(inputs, config, options = {}) {
  if (!(await pathExists(config.modelPath))) {
    return failLocalEmbedding({
      code: "EMBEDDING_MODEL_MISSING",
      message: "Local BGE-M3 model path is missing.",
      providerStatus: "missing_model",
    });
  }

  const maxBatchSize = coercePositiveInteger(options.maxBatchSize, DEFAULT_LOCAL_MAX_BATCH_SIZE);
  const maxInputChars = coercePositiveInteger(options.maxInputChars, DEFAULT_MAX_INPUT_CHARS);
  const request = {
    maxBatchSize,
    maxInputChars,
    model: config.model,
    modelPath: config.modelPath,
    texts: inputs,
  };
  const result = options.runtimeClient
    ? await options.runtimeClient(request)
    : await runLocalBgeRuntime(inputs, config, {
        ...options,
        maxBatchSize,
        maxInputChars,
      });

  if (!result?.ok) {
    const providerStatus = runtimeProviderStatus(result?.error?.code);
    return failLocalEmbedding({
      code: "EMBEDDING_REQUEST_FAILED",
      detail: result?.error?.message,
      message: "Local BGE-M3 embedding runtime is unavailable.",
      providerStatus,
    });
  }

  const embeddings = normalizeRuntimeEmbeddings(result.embeddings);
  if (embeddings.length !== inputs.length) {
    return failLocalEmbedding({
      code: "EMBEDDING_REQUEST_FAILED",
      detail: "Embedding count did not match input count.",
      message: "Local BGE-M3 embedding runtime returned an invalid result.",
      providerStatus: "error",
    });
  }

  return ok({
    embeddings,
    metadata: sanitizeMetadata(config, {
      dimension: result.dimension ?? embeddings[0]?.length,
      elapsed: result.elapsed,
      model: result.model ?? config.model,
    }),
    providerStatus: "ready",
  });
}

export async function getEmbeddingProviderStatus(options = {}) {
  const config = normalizeConfig(options.config ?? {});

  if (config.provider === "local-bge-m3") {
    const modelExists = await pathExists(config.modelPath);
    const status = modelExists ? "ready" : "missing_model";

    return {
      hasSecret: false,
      model: redactEmbeddingText(config.model),
      provider: "local-bge-m3",
      providerStatus: status,
      status,
    };
  }

  return {
    hasSecret: Boolean(config.apiKey) || config.provider === "fake",
    model: redactEmbeddingText(config.model),
    provider: redactEmbeddingText(config.provider),
    providerStatus: config.status,
    status: config.status,
  };
}

export async function embedTexts(input = [], options = {}) {
  const config = normalizeConfig(options.config ?? {});
  const inputs = normalizeInputs(input, options.maxInputChars);

  if (config.provider === "fake") {
    return ok({
      embeddings: inputs.map((text) => deterministicEmbedding(text, options.dimensions ?? FAKE_DIMENSIONS)),
      metadata: sanitizeMetadata(config),
      providerStatus: "ready",
    });
  }

  if (config.provider === "local-bge-m3") {
    return embedLocalBgeTexts(inputs, config, options);
  }

  const validationError = providerErrorForStatus(config);
  if (validationError) {
    return validationError;
  }

  const transport = options.transport ?? globalThis.fetch;
  if (typeof transport !== "function") {
    return fail({
      code: "EMBEDDING_TRANSPORT_UNAVAILABLE",
      message: "Embedding transport is not available.",
      retryable: true,
    });
  }

  try {
    const response = await transport(`${config.baseUrl}/embeddings`, {
      body: JSON.stringify({
        input: inputs,
        model: config.model,
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
        code: "EMBEDDING_REQUEST_FAILED",
        detail: redactEmbeddingText(payload.error?.message),
        message: "Embedding request failed.",
        retryable: retryableStatus(response.status),
      });
    }

    const embeddings = (Array.isArray(payload.data) ? payload.data : [])
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => normalizeEmbeddingVector(item.embedding))
      .filter((vector) => vector.length > 0);

    if (embeddings.length !== inputs.length) {
      return fail({
        code: "EMBEDDING_EMPTY_RESPONSE",
        message: "Embedding response did not include all vectors.",
        retryable: true,
      });
    }

    return ok({
      embeddings,
      metadata: sanitizeMetadata(config, payload),
      providerStatus: "ready",
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : null,
    });
  } catch (error) {
    return fail({
      code: "EMBEDDING_REQUEST_FAILED",
      detail: redactEmbeddingText(error?.message),
      message: "Embedding request failed.",
      retryable: true,
    });
  }
}
