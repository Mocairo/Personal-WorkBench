import { describe, expect, it } from "vitest";
import { getRepositoryDisplayData, getRepositoryTreeRows } from "./CodeRepository";

describe("CodeRepository page data", () => {
  it("normalizes repository metrics and git state with mock-safe defaults", () => {
    expect(
      getRepositoryDisplayData({
        repoFiles: [{ name: "src", meta: "directory" }],
        repoMetrics: { modules: 1, symbols: 7, changed: 2 },
        gitState: {
          branch: "feature/repo",
          changed: 2,
          modified: 1,
          staged: 1,
          statusLabel: "2 changes",
        },
        providerStatus: { message: "Using mock data", status: "mock" },
        sourceHealth: { path: "", status: "unconfigured" },
      }),
    ).toMatchObject({
      gitState: {
        branch: "feature/repo",
        modified: 1,
        staged: 1,
      },
      providerStatus: { status: "mock" },
      repoFiles: [{ name: "src", meta: "directory" }],
      repoMetrics: { modules: 1, symbols: 7, changed: 2 },
      sourceHealth: { status: "unconfigured" },
    });
  });

  it("preserves backend scan, source, structure and file node metadata", () => {
    const data = getRepositoryDisplayData({
      gitState: {
        branch: "not a repository",
        status: "not-repository",
        statusLabel: "unavailable",
      },
      repoFiles: [
        {
          depth: 2,
          gitState: "modified",
          language: "TypeScript",
          name: "Button.tsx",
          relativePath: "src/components/Button.tsx",
          type: "file",
        },
      ],
      repoMetrics: { fileCount: 1, modules: 1, symbols: 1, changed: 0 },
      repositorySource: { id: "local-root", status: "ready" },
      scanSummary: { scanned: 2, skipped: 1, status: "ready" },
      structureNodes: [{ id: "dir-src", label: "src", type: "directory" }],
    });
    const rows = getRepositoryTreeRows(data.repoFiles);

    expect(data).toMatchObject({
      gitState: { branch: "local root", status: "not-repository", statusLabel: "scan ready" },
      repositorySource: { id: "local-root", status: "ready" },
      scanSummary: { scanned: 2, skipped: 1 },
      structureNodes: [{ id: "dir-src", label: "src" }],
    });
    expect(rows[0]).toMatchObject({
      depth: 2,
      language: "TypeScript",
      meta: "TypeScript",
      name: "Button.tsx",
      relativePath: "src/components/Button.tsx",
      state: "modified",
    });
  });
});
