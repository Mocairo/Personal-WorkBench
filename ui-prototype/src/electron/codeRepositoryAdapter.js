import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildCodeStructureNode,
  buildGitSummary,
  buildRepositoryFileNode,
  buildRepositoryMetrics,
  buildRepositoryScanSummary,
  buildRepositorySource,
} from "../shared/codeRepositoryContracts.js";

const execFileAsync = promisify(execFile);
const IGNORED_ENTRIES = new Set([".git", "artifacts", "build", "coverage", "dist", "node_modules"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".md", ".json", ".css", ".html", ".yaml", ".yml"]);
const PRIORITY_FILES = ["package.json", "README.md"];
const DEFAULT_MAX_FILES = 240;
const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
const LANGUAGE_BY_EXTENSION = {
  ".css": "CSS",
  ".html": "HTML",
  ".js": "JavaScript",
  ".json": "JSON",
  ".jsx": "JavaScript",
  ".md": "Markdown",
  ".py": "Python",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".yaml": "YAML",
  ".yml": "YAML",
};

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sortTopLevelEntries(left, right) {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  const leftPriority = PRIORITY_FILES.indexOf(left.name);
  const rightPriority = PRIORITY_FILES.indexOf(right.name);

  if (leftPriority !== rightPriority) {
    if (leftPriority === -1) return 1;
    if (rightPriority === -1) return -1;
    return leftPriority - rightPriority;
  }

  return left.name.localeCompare(right.name);
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function getLanguage(fileName) {
  return LANGUAGE_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? "";
}

function isIgnoredDirectory(name) {
  return name.startsWith(".") || IGNORED_ENTRIES.has(name);
}

function isIgnoredFile(name) {
  return name.startsWith(".");
}

async function scanRepositoryFiles(rootDir, options = {}) {
  const files = [];
  const summary = { errors: 0, scanned: 0, skipped: 0 };
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  async function walk(dirPath, depth = 0) {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      summary.errors += 1;
      return;
    }

    const sortedEntries = entries
      .filter((entry) => {
        if (entry.isDirectory()) {
          const ignored = isIgnoredDirectory(entry.name);
          if (ignored) summary.skipped += 1;
          return !ignored;
        }

        const ignored = isIgnoredFile(entry.name);
        if (ignored) summary.skipped += 1;
        return !ignored;
      })
      .sort((left, right) => sortTopLevelEntries(
        { isDirectory: left.isDirectory(), name: left.name },
        { isDirectory: right.isDirectory(), name: right.name },
      ));

    for (const entry of sortedEntries) {
      if (files.length >= maxFiles) {
        summary.skipped += 1;
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      const relativePath = normalizeRelativePath(path.relative(rootDir, entryPath));

      if (entry.isDirectory()) {
        files.push(buildRepositoryFileNode({
          depth,
          name: entry.name,
          relativePath,
          source: "local",
          type: "directory",
        }));
        summary.scanned += 1;
        await walk(entryPath, depth + 1);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(extension)) {
        summary.skipped += 1;
        continue;
      }

      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        summary.errors += 1;
        continue;
      }

      if (stat.size > maxFileSizeBytes) {
        summary.skipped += 1;
        continue;
      }

      const language = getLanguage(entry.name);
      files.push(buildRepositoryFileNode({
        depth,
        language,
        name: entry.name,
        relativePath,
        size: stat.size,
        source: "local",
        type: "file",
        updatedAt: stat.mtime.toISOString(),
      }));
      summary.scanned += 1;
    }
  }

  await walk(rootDir);
  return { files, summary };
}

async function defaultGitStatusReader(rootDir) {
  const { stdout } = await execFileAsync("git", [
    "-C",
    rootDir,
    "status",
    "--short",
    "--branch",
  ], {
    windowsHide: true,
  });
  return stdout;
}

export function parseGitStatus(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## "));
  const changeLines = lines.filter((line) => !line.startsWith("## "));

  let branch = "not a repository";
  if (branchLine) {
    branch = branchLine
      .slice(3)
      .split("...")[0]
      .replace(/^No commits yet on /, "")
      .trim() || "not a repository";
  }

  const counters = changeLines.reduce(
    (summary, line) => {
      const status = line.slice(0, 2);
      const isUntracked = status === "??";
      const isStaged = !isUntracked && status[0] !== " ";
      const isModified = !isUntracked && status[1] !== " ";

      return {
        changed: summary.changed + 1,
        modified: summary.modified + (isModified ? 1 : 0),
        staged: summary.staged + (isStaged ? 1 : 0),
        untracked: summary.untracked + (isUntracked ? 1 : 0),
      };
    },
    { changed: 0, modified: 0, staged: 0, untracked: 0 },
  );

  return buildGitSummary({
    branch,
    ...counters,
    status: branchLine ? "ready" : "not-repository",
    statusLabel: branchLine ? (counters.changed === 0 ? "clean" : `${counters.changed} changes`) : "unavailable",
  });
}

async function readGitSummary(rootDir, gitStatusReader) {
  try {
    return parseGitStatus(await gitStatusReader(rootDir));
  } catch (error) {
    const details = [
      error?.stderr,
      error?.stdout,
      error?.message,
    ].filter(Boolean).join(" ").toLowerCase();

    if (details.includes("not a git repository")) {
      return buildGitSummary({
        branch: "not a repository",
        status: "not-repository",
        statusLabel: "unavailable",
      });
    }

    return buildGitSummary({
      branch: "git unavailable",
      status: "git-unavailable",
      statusLabel: "unavailable",
    });
  }
}

function buildLanguageRatio(files) {
  return files
    .filter((file) => file.type === "file" && file.language)
    .reduce((ratio, file) => ({ ...ratio, [file.language]: (ratio[file.language] ?? 0) + 1 }), {});
}

function buildStructureNodes(files) {
  const directories = files
    .filter((file) => file.type === "directory")
    .slice(0, 6)
    .map((file) => buildCodeStructureNode({
      id: `dir-${file.relativePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
      label: file.name,
      type: "directory",
      value: 1,
    }));
  const languageNodes = Object.entries(buildLanguageRatio(files))
    .slice(0, 4)
    .map(([language, count]) => buildCodeStructureNode({
      id: `lang-${language.toLowerCase()}`,
      label: language,
      type: "language",
      value: count,
    }));

  return [...directories, ...languageNodes];
}

function getEmptyRepositoryData(status = "missing") {
  return {
    gitState: buildGitSummary({
      branch: "not a repository",
      status: "not-repository",
      statusLabel: "unavailable",
    }),
    repoFiles: [],
    repoMetrics: buildRepositoryMetrics(),
    repositorySource: buildRepositorySource({
      configured: false,
      fileCount: 0,
      status,
    }),
    scanSummary: buildRepositoryScanSummary({ status }),
    structureNodes: [],
  };
}

export async function getCodeRepositoryData(options = {}) {
  const rootDir = options.rootDir ?? process.env.CODE_REPOSITORY_ROOT ?? process.cwd();
  const exists = await pathExists(rootDir);

  if (!exists) {
    return getEmptyRepositoryData("missing");
  }

  const stat = await fs.stat(rootDir).catch(() => null);
  if (!stat?.isDirectory()) {
    return getEmptyRepositoryData("missing");
  }

  const gitStatusReader = options.gitStatusReader ?? defaultGitStatusReader;
  const [{ files, summary }, gitState] = await Promise.all([
    scanRepositoryFiles(rootDir, options),
    readGitSummary(rootDir, gitStatusReader),
  ]);
  const modules = files.filter((entry) => entry.type === "directory" && entry.depth === 0).length;
  const fileCount = files.filter((entry) => entry.type === "file").length;
  const languageRatio = buildLanguageRatio(files);

  return {
    repoFiles: files,
    repoMetrics: buildRepositoryMetrics({
      changed: gitState.changed,
      fileCount,
      languageRatio,
      modules,
      symbols: fileCount,
    }),
    gitState,
    repositorySource: buildRepositorySource({
      branch: gitState.branch,
      fileCount,
      name: path.basename(rootDir),
      path: ".",
      status: "ready",
    }),
    scanSummary: buildRepositoryScanSummary({
      ...summary,
      status: summary.errors > 0 ? "error" : "ready",
      updatedAt: new Date().toISOString(),
    }),
    structureNodes: buildStructureNodes(files),
  };
}

export async function getCodeRepositoryFiles(options = {}) {
  return (await getCodeRepositoryData(options)).repoFiles;
}

export async function getCodeRepositoryMetrics(options = {}) {
  return (await getCodeRepositoryData(options)).repoMetrics;
}

export async function getCodeRepositoryStructure(options = {}) {
  return (await getCodeRepositoryData(options)).structureNodes;
}
