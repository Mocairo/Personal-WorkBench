import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultLlmEnvPath,
  loadLlmConfig,
  loadLlmPublicConfig,
  parseDotEnv,
} from "./llmEnvLoader";

const ENV_KEYS = ["LLM_PROVIDER", "LLM_MODEL", "OPENAI_API_KEY", "OPENAI_BASE_URL"];

describe("main-only LLM env loader", () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("parses simple .env values without exposing comments or quotes", () => {
    expect(parseDotEnv("LLM_PROVIDER=openai\nLLM_MODEL=\"gpt-4.1-mini\"\n# ignored\nOPENAI_BASE_URL='https://example.test/v1'\n")).toEqual({
      LLM_MODEL: "gpt-4.1-mini",
      LLM_PROVIDER: "openai",
      OPENAI_BASE_URL: "https://example.test/v1",
    });
  });

  it("resolves the parent Electron .env path by default", () => {
    expect(getDefaultLlmEnvPath()).toBe(path.resolve("D:\\python_code\\Electron\\.env"));
  });

  it("loads provider, model, key and base URL from an Electron-root .env path", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-env-"));
    const envPath = path.join(rootDir, ".env");
    await fs.writeFile(
      envPath,
      [
        "LLM_PROVIDER=openai",
        "LLM_MODEL=gpt-4.1-mini",
        "OPENAI_API_KEY=sk-env-loader-secret",
        "OPENAI_BASE_URL=https://gateway.example.test/v1",
      ].join("\n"),
    );

    const config = await loadLlmConfig({ envPath, processEnv: {} });

    expect(config).toMatchObject({
      apiKey: "sk-env-loader-secret",
      baseUrl: "https://gateway.example.test/v1",
      hasSecret: true,
      model: "gpt-4.1-mini",
      provider: "openai",
      status: "ready",
    });
    expect(JSON.stringify(await loadLlmPublicConfig({ envPath, processEnv: {} }))).not.toMatch(/sk-env-loader-secret|apiKey/);
  });

  it("lets process.env override .env values", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-env-override-"));
    const envPath = path.join(rootDir, ".env");
    await fs.writeFile(
      envPath,
      "LLM_PROVIDER=openai\nLLM_MODEL=file-model\nOPENAI_API_KEY=sk-file-secret\nOPENAI_BASE_URL=https://file.example/v1\n",
    );

    const config = await loadLlmConfig({
      envPath,
      processEnv: {
        LLM_MODEL: "process-model",
        OPENAI_API_KEY: "sk-process-secret",
      },
    });

    expect(config).toMatchObject({
      apiKey: "sk-process-secret",
      baseUrl: "https://file.example/v1",
      model: "process-model",
      status: "ready",
    });
  });

  it("returns unconfigured and missing_secret states without reading a missing file as fatal", async () => {
    const missingPath = path.join(os.tmpdir(), "missing-llm-env", ".env");

    await expect(loadLlmConfig({ envPath: missingPath, processEnv: {} })).resolves.toMatchObject({
      hasSecret: false,
      provider: "openai",
      secretStatus: "missing_secret",
      status: "unconfigured",
    });
    await expect(loadLlmConfig({
      envPath: missingPath,
      processEnv: {
        LLM_MODEL: "gpt-4.1-mini",
        LLM_PROVIDER: "openai",
      },
    })).resolves.toMatchObject({
      hasSecret: false,
      model: "gpt-4.1-mini",
      provider: "openai",
      secretStatus: "missing_secret",
      status: "missing_secret",
    });
    await expect(loadLlmPublicConfig({
      envPath: missingPath,
      processEnv: {
        LLM_MODEL: "gpt-4.1-mini",
        LLM_PROVIDER: "openai",
      },
    })).resolves.toMatchObject({
      model: {
        status: "missing_secret",
      },
      provider: {
        hasSecret: false,
        secretHint: "not configured",
        status: "missing_secret",
      },
      secret: {
        hasSecret: false,
        secretHint: "not configured",
        status: "missing_secret",
      },
    });
  });
});
