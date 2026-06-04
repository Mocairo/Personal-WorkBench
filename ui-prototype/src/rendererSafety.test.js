import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RENDERER_FORBIDDEN_PATTERN = /\b(node:fs|node:path|fs\/promises|child_process|sqlite|electron)\b|process\./;
const RENDERER_EXTENSIONS = new Set([".js", ".jsx"]);

async function listRendererFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "electron") {
        continue;
      }
      files.push(...await listRendererFiles(entryPath));
      continue;
    }

    if (
      RENDERER_EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith(".test.js") &&
      !entry.name.endsWith(".test.jsx")
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

describe("renderer safety boundary", () => {
  it("does not import direct Node or Electron capabilities outside src/electron", async () => {
    const files = await listRendererFiles(path.resolve("src"));
    const violations = [];

    for (const filePath of files) {
      const source = await fs.readFile(filePath, "utf8");
      if (RENDERER_FORBIDDEN_PATTERN.test(source)) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});
