import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  embedTexts,
  getEmbeddingProviderStatus,
} from "./embeddingProviderAdapter";

function createSuccessfulRuntimeProcess(payload) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    end() {
      queueMicrotask(() => {
        child.stdout.emit("data", JSON.stringify(payload));
        child.emit("close", 0);
      });
    },
    write() {},
  };
  child.kill = vi.fn();
  return child;
}

describe("embedding provider adapter", () => {
  it("returns stable finite vectors from the deterministic fake provider", async () => {
    const first = await embedTexts(["alpha note"], {
      config: { model: "fake-embedding", provider: "fake" },
    });
    const second = await embedTexts(["alpha note"], {
      config: { model: "fake-embedding", provider: "fake" },
    });

    expect(first).toMatchObject({
      ok: true,
      data: {
        metadata: { model: "fake-embedding", provider: "fake" },
        providerStatus: "ready",
      },
    });
    expect(first.data.embeddings).toEqual(second.data.embeddings);
    expect(first.data.embeddings[0].length).toBeGreaterThan(2);
    expect(first.data.embeddings[0].every(Number.isFinite)).toBe(true);
  });

  it("does not call transport when the provider is unconfigured", async () => {
    const transport = vi.fn();

    const status = await getEmbeddingProviderStatus({
      config: { provider: "", model: "", apiKey: "" },
    });
    const result = await embedTexts(["needle"], {
      config: { provider: "", model: "", apiKey: "" },
      transport,
    });

    expect(status).toMatchObject({ providerStatus: "unconfigured", status: "unconfigured" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "EMBEDDING_PROVIDER_UNCONFIGURED" },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not call transport when the provider secret is missing", async () => {
    const transport = vi.fn();

    const result = await embedTexts(["needle"], {
      config: { model: "text-embedding-3-small", provider: "openai", apiKey: "" },
      transport,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "EMBEDDING_SECRET_MISSING" },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("posts bounded OpenAI-compatible embedding requests without leaking the secret", async () => {
    const transport = vi.fn(async () => ({
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: "text-embedding-3-small",
      }),
      ok: true,
      status: 200,
    }));
    const longInput = `needle apiKey=sk-embed-secret D:\\private\\vault\\note.md ${"x".repeat(500)}`;

    const result = await embedTexts([longInput], {
      config: {
        apiKey: "sk-live-secret",
        baseUrl: "https://api.openai.test/v1/",
        model: "text-embedding-3-small",
        provider: "openai",
      },
      maxInputChars: 80,
      transport,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        embeddings: [[0.1, 0.2, 0.3]],
        metadata: { model: "text-embedding-3-small", provider: "openai" },
        providerStatus: "ready",
      },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, request] = transport.mock.calls[0];
    expect(url).toBe("https://api.openai.test/v1/embeddings");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer sk-live-secret");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: "text-embedding-3-small",
    });
    expect(body.input[0].length).toBeLessThanOrEqual(80);
    expect(JSON.stringify(body)).not.toMatch(/sk-embed-secret|apiKey=|D:\\private/);
    expect(JSON.stringify(result)).not.toMatch(/sk-live-secret|Authorization|apiKey|D:\\private/);
  });

  it("wraps embedding API errors with sanitized ApiResult failures", async () => {
    const transport = vi.fn(async () => ({
      json: async () => ({
        error: { message: "bad key sk-error-secret at D:\\private\\vault" },
      }),
      ok: false,
      status: 500,
    }));

    const result = await embedTexts(["needle"], {
      config: {
        apiKey: "sk-live-secret",
        baseUrl: "https://api.openai.test/v1",
        model: "text-embedding-3-small",
        provider: "openai",
      },
      transport,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EMBEDDING_REQUEST_FAILED",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-error-secret|sk-live-secret|D:\\private/);
  });

  it("reports local bge-m3 as ready when the model directory exists", async () => {
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "bge-m3-model-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");

    const status = await getEmbeddingProviderStatus({
      config: {
        modelPath,
        provider: "local-bge-m3",
      },
    });

    expect(status).toMatchObject({
      provider: "local-bge-m3",
      providerStatus: "ready",
      status: "ready",
    });
    expect(JSON.stringify(status)).not.toContain(modelPath);
  });

  it("reports local bge-m3 as missing_model when the model directory does not exist", async () => {
    const modelPath = path.join(os.tmpdir(), `missing-bge-m3-${Date.now()}`);

    const status = await getEmbeddingProviderStatus({
      config: {
        modelPath,
        provider: "local-bge-m3",
      },
    });

    expect(status).toMatchObject({
      provider: "local-bge-m3",
      providerStatus: "missing_model",
      status: "missing_model",
    });
  });

  it("uses a fixed local runtime command for local bge-m3 embeddings", async () => {
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "bge-m3-command-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    const spawn = vi.fn(() => createSuccessfulRuntimeProcess({
      dimension: 2,
      elapsed: 5,
      embeddings: [[0.1, 0.2]],
      model: "bge-m3",
      ok: true,
    }));

    await embedTexts(["alpha"], {
      config: {
        command: "calc.exe",
        modelPath,
        provider: "local-bge-m3",
      },
      pythonPath: "python-fixed.exe",
      spawn,
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args] = spawn.mock.calls[0];
    expect(command).toBe("python-fixed.exe");
    expect(args.join(" ")).toContain("embed_bge_m3.py");
    expect(args.join(" ")).toContain("--model-path");
    expect(args.join(" ")).toContain(modelPath);
    expect(args.join(" ")).not.toContain("calc.exe");
  });

  it("starts the local bge runtime with UTF-8 stdio and sends JSON bytes", async () => {
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "bge-m3-utf8-runtime-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    const writtenChunks = [];
    const spawn = vi.fn(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end() {
          queueMicrotask(() => {
            child.stdout.emit("data", JSON.stringify({
              dimension: 2,
              embeddings: [[0.1, 0.2]],
              model: "bge-m3",
              ok: true,
            }));
            child.emit("close", 0);
          });
        },
        write(chunk) {
          writtenChunks.push(chunk);
        },
      };
      child.kill = vi.fn();
      return child;
    });

    const result = await embedTexts(["中文 knowledge chunk"], {
      config: {
        modelPath,
        provider: "local-bge-m3",
      },
      pythonPath: "python-fixed.exe",
      spawn,
    });

    expect(result.ok).toBe(true);
    const spawnOptions = spawn.mock.calls[0][2];
    expect(spawnOptions.env.PYTHONIOENCODING).toBe("utf-8");
    expect(spawnOptions.env.PYTHONUTF8).toBe("1");
    expect(Buffer.isBuffer(writtenChunks[0])).toBe(true);
    expect(writtenChunks[0].toString("utf8")).toContain("中文 knowledge chunk");
  });

  it("returns runtime embeddings for local bge-m3 when the runtime client succeeds", async () => {
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "bge-m3-runtime-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    const runtimeClient = vi.fn(async () => ({
      dimension: 3,
      elapsed: 11,
      embeddings: [[0.4, 0.5, 0.6]],
      model: "bge-m3",
      ok: true,
    }));

    const result = await embedTexts(["needle"], {
      config: {
        modelPath,
        provider: "local-bge-m3",
      },
      runtimeClient,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        embeddings: [[0.4, 0.5, 0.6]],
        metadata: {
          model: "bge-m3",
          provider: "local-bge-m3",
        },
        providerStatus: "ready",
      },
    });
    expect(JSON.stringify(result)).not.toContain(modelPath);
  });

  it("wraps local bge-m3 runtime failures without exposing paths or secrets", async () => {
    const modelPath = await fs.mkdtemp(path.join(os.tmpdir(), "bge-m3-runtime-error-"));
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    const runtimeClient = vi.fn(async () => ({
      error: {
        code: "RUNTIME_UNAVAILABLE",
        message: "runtime crashed at D:\\private\\vault with token=sk-local-runtime",
      },
      ok: false,
    }));

    const result = await embedTexts(["needle"], {
      config: {
        apiKey: "sk-hidden",
        modelPath,
        provider: "local-bge-m3",
      },
      runtimeClient,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "EMBEDDING_REQUEST_FAILED",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-hidden|sk-local-runtime|token=|D:\\private/);
  });
});
