import { describe, expect, it } from "vitest";
import {
  buildCodeStructureNode,
  buildGitSummary,
  buildRepositoryFileNode,
  buildRepositoryMetrics,
  buildRepositoryScanSummary,
  buildRepositorySource,
} from "./codeRepositoryContracts";

describe("code repository contracts", () => {
  it("normalizes repository file nodes with relative paths and metadata", () => {
    expect(
      buildRepositoryFileNode({
        depth: 2,
        gitState: "modified",
        language: "JavaScript",
        name: "App.jsx",
        relativePath: "src/App.jsx",
        size: 128,
        source: "local",
        type: "file",
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
    ).toEqual({
      depth: 2,
      gitState: "modified",
      icon: "code",
      id: "repo-src-app-jsx",
      language: "JavaScript",
      meta: "JavaScript",
      name: "App.jsx",
      relativePath: "src/App.jsx",
      size: 128,
      source: "local",
      state: "modified",
      status: "modified",
      type: "file",
      updatedAt: "2026-06-01T10:00:00.000Z",
    });
  });

  it("builds stable source, git, metrics, structure and scan summary shapes", () => {
    expect(buildRepositorySource({ branch: "main", fileCount: 4, name: "repo", path: "." })).toMatchObject({
      branch: "main",
      configured: true,
      fileCount: 4,
      id: "local-root",
      source: "local",
      status: "ready",
    });

    expect(buildGitSummary({ branch: "main", changed: 2, modified: 1, staged: 1 })).toMatchObject({
      branch: "main",
      changed: 2,
      modified: 1,
      staged: 1,
      status: "ready",
      statusLabel: "2 changes",
      untracked: 0,
    });

    expect(buildRepositoryMetrics({ fileCount: 4, languageRatio: { JavaScript: 2 }, modules: 2 })).toMatchObject({
      changed: 0,
      fileCount: 4,
      languageRatio: { JavaScript: 2 },
      modules: 2,
      symbols: 4,
    });

    expect(buildCodeStructureNode({ id: "src", label: "src", type: "directory" })).toMatchObject({
      id: "src",
      label: "src",
      source: "local",
      type: "directory",
    });

    expect(buildRepositoryScanSummary({ scanned: 4, skipped: 2 })).toMatchObject({
      errors: 0,
      scanned: 4,
      skipped: 2,
      source: "local",
      status: "ready",
    });
  });
});
