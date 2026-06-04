import { describe, expect, it } from "vitest";
import {
  buildProviderStatus,
  buildSourceHealth,
  normalizeSourceStatus,
  summarizeSourceHealth,
} from "./sourceStatus";

describe("source status contracts", () => {
  it("normalizes SourceHealth rows for configured, missing and mock sources", () => {
    const ready = buildSourceHealth({
      id: "knowledgeBasePath",
      label: "Knowledge Base",
      path: "D:\\docs",
      readable: true,
    });
    const missing = buildSourceHealth({
      id: "codeRepositoryPath",
      label: "Code Repository",
      path: "D:\\missing",
      readable: false,
      reason: "Path not found",
    });
    const mock = buildSourceHealth({
      id: "musicLibraryPath",
      label: "Local Music",
      mock: true,
      path: "",
    });

    expect(ready).toMatchObject({ configured: true, message: "Ready", status: "ready" });
    expect(missing).toMatchObject({
      configured: true,
      message: "Path not found",
      status: "missing",
    });
    expect(mock).toMatchObject({
      configured: false,
      message: "Using mock data",
      status: "mock",
    });
    expect(normalizeSourceStatus("type mismatch")).toBe("error");
  });

  it("summarizes ProviderStatus without exposing secrets", () => {
    const summary = summarizeSourceHealth([
      buildSourceHealth({
        id: "knowledgeBasePath",
        label: "Knowledge Base",
        mock: true,
        path: "",
      }),
      buildSourceHealth({
        id: "localIntelPath",
        label: "local-intel",
        path: "D:\\intel",
        readable: true,
      }),
    ]);

    expect(summary).toEqual({
      error: 0,
      missing: 0,
      mock: 1,
      ready: 1,
      total: 2,
      unconfigured: 0,
    });
    expect(buildProviderStatus({ sourceId: "localIntelPath", status: "mock" })).toMatchObject({
      configured: false,
      sourceId: "localIntelPath",
      status: "mock",
    });
  });
});
