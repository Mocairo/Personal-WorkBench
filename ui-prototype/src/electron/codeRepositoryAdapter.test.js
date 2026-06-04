import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCodeRepositoryData,
  getCodeRepositoryFiles,
  getCodeRepositoryMetrics,
  getCodeRepositoryStructure,
  parseGitStatus,
} from "./codeRepositoryAdapter";

async function createRepositoryFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-repo-"));
  await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "src", "components"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "node_modules"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "README.md"), "# Fixture\n");
  await fs.writeFile(path.join(rootDir, "package.json"), "{}\n");
  await fs.writeFile(path.join(rootDir, "src", "App.jsx"), "export default function App() {}\n");
  await fs.writeFile(path.join(rootDir, "src", "components", "Button.tsx"), "export function Button() {}\n");

  return rootDir;
}

describe("code repository adapter", () => {
  it("builds repository page data from a local project directory", async () => {
    const rootDir = await createRepositoryFixture();

    const data = await getCodeRepositoryData({
      rootDir,
      gitStatusReader: async () => [
        "## feature/local-adapter",
        " M src/App.jsx",
        "A  src/newFile.js",
        "?? notes.md",
      ].join("\n"),
    });

    expect(data.repoFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ depth: 0, name: "docs", relativePath: "docs", type: "directory" }),
      expect.objectContaining({ depth: 0, name: "src", relativePath: "src", type: "directory" }),
      expect.objectContaining({ depth: 1, language: "JavaScript", name: "App.jsx", relativePath: "src/App.jsx", type: "file" }),
      expect.objectContaining({ depth: 2, language: "TypeScript", name: "Button.tsx", relativePath: "src/components/Button.tsx", type: "file" }),
      expect.objectContaining({ depth: 0, name: "package.json", relativePath: "package.json", type: "file" }),
      expect.objectContaining({ depth: 0, name: "README.md", relativePath: "README.md", type: "file" }),
    ]));
    expect(JSON.stringify(data)).not.toContain(rootDir);
    expect(data.repoMetrics).toMatchObject({
      modules: 2,
      fileCount: 4,
      symbols: 4,
      changed: 3,
    });
    expect(data.gitState).toMatchObject({
      branch: "feature/local-adapter",
      changed: 3,
      modified: 1,
      staged: 1,
      status: "ready",
      statusLabel: "3 changes",
      untracked: 1,
    });
    expect(data.repositorySource).toMatchObject({
      branch: "feature/local-adapter",
      fileCount: 4,
      id: "local-root",
      source: "local",
      status: "ready",
    });
    expect(data.scanSummary).toMatchObject({
      scanned: 7,
      source: "local",
      status: "ready",
    });
    expect(data.structureNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "dir-src", label: "src", type: "directory" }),
      expect.objectContaining({ id: "lang-javascript", label: "JavaScript", type: "language" }),
    ]));
  });

  it("returns safe data when the project directory is missing", async () => {
    const data = await getCodeRepositoryData({
      rootDir: path.join(os.tmpdir(), "missing-code-repository"),
      gitStatusReader: async () => "",
    });

    expect(data).toMatchObject({
      repoFiles: [],
      repoMetrics: { fileCount: 0, modules: 0, symbols: 0, changed: 0 },
      gitState: {
        branch: "not a repository",
        status: "not-repository",
        statusLabel: "unavailable",
      },
      scanSummary: {
        scanned: 0,
        skipped: 0,
        status: "missing",
      },
    });
  });

  it("parses git status branch and change counters", () => {
    expect(
      parseGitStatus([
        "## main...origin/main",
        " M src/App.jsx",
        "M  src/main.jsx",
        "?? scratch.md",
      ].join("\n")),
    ).toMatchObject({
      branch: "main",
      changed: 3,
      modified: 1,
      staged: 1,
      status: "ready",
      statusLabel: "3 changes",
      untracked: 1,
    });
  });

  it("ignores generated, hidden, git and oversized entries", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-repo-safe-"));
    await fs.mkdir(path.join(rootDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(rootDir, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "build"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "coverage"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "index.js"), "ok\n");
    await fs.writeFile(path.join(rootDir, ".git", "config"), "secret\n");
    await fs.writeFile(path.join(rootDir, ".hidden", "secret.js"), "secret\n");
    await fs.writeFile(path.join(rootDir, "node_modules", "pkg", "index.js"), "dependency\n");
    await fs.writeFile(path.join(rootDir, "dist", "bundle.js"), "generated\n");
    await fs.writeFile(path.join(rootDir, "build", "bundle.js"), "generated\n");
    await fs.writeFile(path.join(rootDir, "coverage", "report.json"), "{}\n");
    await fs.writeFile(path.join(rootDir, "too-big.ts"), "x".repeat(64));

    const data = await getCodeRepositoryData({
      gitStatusReader: async () => "",
      maxFileSizeBytes: 16,
      rootDir,
    });

    expect(data.repoFiles).toEqual([
      expect.objectContaining({ name: "index.js", relativePath: "index.js" }),
    ]);
    expect(data.scanSummary.skipped).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(data)).not.toContain(rootDir);
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("returns non fatal Git states for non repositories and reader failures", async () => {
    expect(parseGitStatus("")).toMatchObject({
      branch: "not a repository",
      changed: 0,
      status: "not-repository",
      statusLabel: "unavailable",
    });

    const rootDir = await createRepositoryFixture();
    const nonRepository = await getCodeRepositoryData({
      gitStatusReader: async () => {
        const error = new Error("fatal");
        error.stderr = "fatal: not a git repository (or any of the parent directories): .git";
        throw error;
      },
      rootDir,
    });

    expect(nonRepository.gitState).toMatchObject({
      branch: "not a repository",
      status: "not-repository",
      statusLabel: "unavailable",
    });

    const data = await getCodeRepositoryData({
      gitStatusReader: async () => {
        throw new Error("git missing");
      },
      rootDir,
    });

    expect(data.gitState).toMatchObject({
      branch: "git unavailable",
      status: "git-unavailable",
      statusLabel: "unavailable",
    });
    expect(data.repoFiles.length).toBeGreaterThan(0);
  });

  it("exposes focused file, metrics and structure helpers", async () => {
    const rootDir = await createRepositoryFixture();
    const options = { gitStatusReader: async () => "## main\n", rootDir };

    await expect(getCodeRepositoryFiles(options)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "src/App.jsx" }),
    ]));
    await expect(getCodeRepositoryMetrics(options)).resolves.toMatchObject({
      fileCount: 4,
      modules: 2,
    });
    await expect(getCodeRepositoryStructure(options)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "src" }),
    ]));
  });
});
