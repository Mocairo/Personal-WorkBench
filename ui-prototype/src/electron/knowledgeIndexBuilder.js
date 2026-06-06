import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  limitKnowledgeIndexText,
  normalizeKnowledgeIndex,
  redactKnowledgeIndexText,
} from "./knowledgeIndexStore.js";
import { createKnowledgeDocumentId } from "../shared/knowledgeContracts.js";

const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv", ".pdf", ".docx", ".puml"]);
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv", ".puml"]);
const METADATA_ONLY_EXTENSIONS = new Set([".pdf", ".docx"]);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build"]);
const DEFAULT_MAX_DOCUMENTS = 500;
const DEFAULT_MAX_FILE_SIZE_BYTES = 512 * 1024;
const TAGS_BY_EXTENSION = {
  ".csv": "csv",
  ".docx": "docx",
  ".json": "json",
  ".markdown": "markdown",
  ".md": "markdown",
  ".pdf": "pdf",
  ".puml": "diagram",
  ".txt": "text",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRelativePath(relativePath = "") {
  return relativePath.split(path.sep).join("/");
}

function hashText(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}

function getType(extension) {
  return extension === ".markdown" ? "md" : extension.replace(/^\./, "") || "document";
}

function getTag(extension) {
  return TAGS_BY_EXTENSION[extension] ?? "document";
}

function isIgnoredDirectory(name = "") {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

function isIgnoredFile(name = "") {
  return name.startsWith(".") || name.toLowerCase() === ".env";
}

function titleFromRelativePath(relativePath = "") {
  return relativePath.split("/").pop() || relativePath || "Untitled";
}

function normalizeText(content = "") {
  return redactKnowledgeIndexText(content).replace(/\s+/g, " ").trim();
}

function makeChunk({ documentId, ordinal, relativePath, text, title, titlePath, updatedAt }) {
  const preview = limitKnowledgeIndexText(normalizeText(text));

  return {
    chunkId: `${documentId}:chunk-${ordinal}`,
    documentId,
    ordinal,
    preview,
    relativePath,
    source: "local",
    textHash: hashText(preview),
    title,
    titlePath,
    updatedAt,
  };
}

function splitTextChunks(content = "", options = {}) {
  const maxChunkChars = options.maxChunkChars ?? 900;
  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [content]) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkChars && current) {
      chunks.push(current);
      current = paragraph;
      continue;
    }
    current = next;
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function splitMarkdownChunks(content = "") {
  const lines = content.split(/\r?\n/);
  const titleStack = [];
  const sections = [];
  let currentLines = [];
  let currentTitlePath = [];
  let currentTitle = "";

  function flush() {
    const text = currentLines.join("\n").trim();
    if (text) {
      sections.push({
        text,
        title: currentTitle,
        titlePath: [...currentTitlePath],
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const title = heading[2].trim();
      titleStack[level - 1] = title;
      titleStack.length = level;
      currentTitle = title;
      currentTitlePath = titleStack.filter(Boolean);
      continue;
    }
    currentLines.push(line);
  }

  flush();

  if (sections.length === 0) {
    return splitTextChunks(content).map((text) => ({ text, title: "", titlePath: [] }));
  }

  return sections.flatMap((section) => splitTextChunks(section.text).map((text) => ({
    text,
    title: section.title,
    titlePath: section.titlePath,
  })));
}

function splitDocumentChunks(content = "", extension = "") {
  if (extension === ".md" || extension === ".markdown") {
    return splitMarkdownChunks(content);
  }

  return splitTextChunks(content).map((text) => ({ text, title: "", titlePath: [] }));
}

function getFsHooks(options = {}) {
  return {
    readFile: options.readFile ?? fs.readFile,
    readdir: options.readdir ?? fs.readdir,
    stat: options.stat ?? fs.stat,
  };
}

function skippedItem(reason, relativePath) {
  return {
    reason,
    relativePath: normalizeRelativePath(relativePath),
  };
}

function failedItem(reason, relativePath) {
  return skippedItem(reason, relativePath);
}

async function collectEntries(rootDir, options = {}) {
  const fsHooks = getFsHooks(options);
  const entries = [];
  const skipped = [];
  const errors = [];
  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  async function walk(dirPath) {
    let dirEntries = [];
    try {
      dirEntries = await fsHooks.readdir(dirPath, { withFileTypes: true });
    } catch {
      errors.push(failedItem("directory-read-failed", path.relative(rootDir, dirPath) || "."));
      return;
    }

    for (const entry of dirEntries) {
      const entryPath = path.join(dirPath, entry.name);
      const relativePath = normalizeRelativePath(path.relative(rootDir, entryPath));

      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name)) {
          skipped.push(skippedItem("ignored-directory", relativePath));
          continue;
        }

        await walk(entryPath);
        continue;
      }

      if (isIgnoredFile(entry.name)) {
        skipped.push(skippedItem("ignored-file", relativePath));
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!DOCUMENT_EXTENSIONS.has(extension)) {
        skipped.push(skippedItem("unsupported-extension", relativePath));
        continue;
      }

      if (entries.length >= maxDocuments) {
        skipped.push(skippedItem("document-limit", relativePath));
        continue;
      }

      let stat = null;
      try {
        stat = await fsHooks.stat(entryPath);
      } catch {
        errors.push(failedItem("stat-failed", relativePath));
        continue;
      }

      if (stat.size > maxFileSizeBytes) {
        skipped.push(skippedItem("file-too-large", relativePath));
        continue;
      }

      entries.push({ entryPath, extension, relativePath, stat });
    }
  }

  await walk(rootDir);
  return { entries, errors, skipped };
}

async function buildDocument(entry, options = {}) {
  const fsHooks = getFsHooks(options);
  const title = titleFromRelativePath(entry.relativePath);
  const documentId = createKnowledgeDocumentId(entry.relativePath);
  const updatedAt = entry.stat.mtime?.toISOString?.() ?? options.now ?? new Date().toISOString();
  const type = getType(entry.extension);
  const tag = getTag(entry.extension);

  if (METADATA_ONLY_EXTENSIONS.has(entry.extension)) {
    const metadataPreview = entry.extension === ".docx"
      ? "DOCX metadata only. Text extraction is not enabled in this phase."
      : "PDF metadata only. Text extraction is not enabled in this phase.";
    return {
      chunks: [],
      document: {
        chunks: 0,
        id: documentId,
        inferredTags: [tag],
        preview: metadataPreview,
        relativePath: entry.relativePath,
        size: entry.stat.size,
        source: "local",
        sourceHash: hashText(`${entry.relativePath}:${entry.stat.size}:${updatedAt}`),
        status: "metadata-only",
        title,
        type,
        updatedAt,
      },
    };
  }

  if (!TEXT_EXTENSIONS.has(entry.extension)) {
    return {
      chunks: [],
      document: {
        chunks: 0,
        id: documentId,
        inferredTags: [tag],
        preview: "",
        relativePath: entry.relativePath,
        size: entry.stat.size,
        source: "local",
        sourceHash: hashText(`${entry.relativePath}:${entry.stat.size}:${updatedAt}`),
        status: "skipped",
        title,
        type,
        updatedAt,
      },
    };
  }

  const content = await fsHooks.readFile(entry.entryPath, "utf8");
  const chunkInputs = splitDocumentChunks(content, entry.extension);
  const chunks = chunkInputs
    .map((chunkInput, ordinal) => makeChunk({
      documentId,
      ordinal,
      relativePath: entry.relativePath,
      text: chunkInput.text,
      title: cleanString(chunkInput.title) || title,
      titlePath: chunkInput.titlePath?.length > 0 ? chunkInput.titlePath : [title],
      updatedAt,
    }))
    .filter((chunk) => chunk.preview);
  const preview = chunks[0]?.preview ?? limitKnowledgeIndexText(normalizeText(content));

  return {
    chunks,
    document: {
      chunks: chunks.length,
      id: documentId,
      inferredTags: [tag],
      preview,
      relativePath: entry.relativePath,
      size: entry.stat.size,
      source: "local",
      sourceHash: hashText(`${entry.relativePath}:${entry.stat.size}:${updatedAt}:${preview}`),
      status: chunks.length > 0 ? "indexed" : "empty",
      title,
      type,
      updatedAt,
    },
  };
}

export async function buildKnowledgeIndexFromRoot(options = {}) {
  const rootDir = cleanString(options.rootDir);
  const now = cleanString(options.now) || new Date().toISOString();
  const documents = [];
  const chunks = [];
  const failed = [];
  const { entries, errors, skipped } = await collectEntries(rootDir, options);
  failed.push(...errors);

  for (const entry of entries) {
    try {
      const result = await buildDocument(entry, { ...options, now });
      documents.push(result.document);
      chunks.push(...result.chunks);
    } catch {
      const title = titleFromRelativePath(entry.relativePath);
      const documentId = createKnowledgeDocumentId(entry.relativePath);
      const updatedAt = entry.stat.mtime?.toISOString?.() ?? now;
      failed.push(failedItem("parse-failed", entry.relativePath));
      documents.push({
        chunks: 0,
        id: documentId,
        inferredTags: [getTag(entry.extension)],
        message: "Could not parse document",
        preview: "",
        relativePath: entry.relativePath,
        size: entry.stat.size,
        source: "local",
        sourceHash: hashText(`${entry.relativePath}:${entry.stat.size}:${updatedAt}`),
        status: "error",
        title,
        type: getType(entry.extension),
        updatedAt,
      });
    }
  }

  return normalizeKnowledgeIndex({
    chunks,
    documents,
    failed,
    skipped,
    source: "local",
    status: failed.length > 0 ? "error" : "ready",
    summary: {
      chunks: chunks.length,
      docs: documents.length,
      failed: failed.length,
      indexed: documents.filter((doc) => doc.status === "indexed").length,
      scanned: documents.length,
      skipped: skipped.length,
    },
    updatedAt: now,
  });
}
