import fs from "node:fs/promises";
import path from "node:path";
import {
  buildLlmModelProfile,
  buildLlmProviderProfile,
  buildSecretStatus,
} from "../shared/llmSecurityContracts.js";

const ENV_KEYS = ["LLM_PROVIDER", "LLM_MODEL", "OPENAI_API_KEY", "OPENAI_BASE_URL"];
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ENV_PATH = "D:\\python_code\\Electron\\.env";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unquote(value) {
  const text = cleanString(value);
  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }

  return text;
}

function pickEnvValue(fileEnv, processEnv, key) {
  if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
    return cleanString(processEnv[key]);
  }

  return cleanString(fileEnv[key]);
}

async function readEnvFile(envPath) {
  try {
    return await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export function getDefaultLlmEnvPath() {
  return path.resolve(DEFAULT_ENV_PATH);
}

export function parseDotEnv(content = "") {
  return String(content).split(/\r?\n/).reduce((values, rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return values;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) {
      return values;
    }

    const key = normalized.slice(0, separator).trim();
    if (!ENV_KEYS.includes(key)) {
      return values;
    }

    return {
      ...values,
      [key]: unquote(normalized.slice(separator + 1)),
    };
  }, {});
}

export async function loadLlmConfig(options = {}) {
  const envPath = options.envPath ?? getDefaultLlmEnvPath();
  const processEnv = options.processEnv ?? process.env;
  const fileEnv = parseDotEnv(await readEnvFile(envPath));
  const merged = ENV_KEYS.reduce((values, key) => ({
    ...values,
    [key]: pickEnvValue(fileEnv, processEnv, key),
  }), {});

  const provider = merged.LLM_PROVIDER || "openai";
  const model = merged.LLM_MODEL || "not configured";
  const apiKey = merged.OPENAI_API_KEY;
  const baseUrl = merged.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const hasProviderConfig = Boolean(merged.LLM_PROVIDER || merged.LLM_MODEL || apiKey || merged.OPENAI_BASE_URL);
  const hasSecret = Boolean(apiKey);
  const secretStatus = hasSecret ? "ready" : "missing_secret";
  const status = hasSecret ? "ready" : hasProviderConfig ? "missing_secret" : "unconfigured";

  return {
    apiKey,
    baseUrl,
    hasSecret,
    model,
    provider,
    secretStatus,
    status,
  };
}

export async function loadLlmPublicConfig(options = {}) {
  const config = await loadLlmConfig(options);
  const providerInput = {
    hasSecret: config.hasSecret,
    id: config.provider,
    label: config.provider === "openai" ? "OpenAI" : config.provider,
    message: config.status === "ready"
      ? "Provider ready"
      : config.secretStatus === "missing_secret"
        ? "Provider secret is not configured"
        : "Provider not configured",
    model: config.model,
    provider: config.provider,
    secretHint: config.hasSecret ? config.apiKey : "not configured",
    status: config.status,
  };

  return {
    model: buildLlmModelProfile(providerInput),
    provider: buildLlmProviderProfile(providerInput),
    secret: buildSecretStatus({
      ...providerInput,
      id: `${config.provider}-secret`,
      label: `${providerInput.label} Secret`,
      status: config.secretStatus,
    }),
  };
}
