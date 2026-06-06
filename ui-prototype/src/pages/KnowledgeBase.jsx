import React, { useMemo, useRef, useState } from "react";
import parseHtml, { domToReact } from "html-react-parser";
import { BookOpen, Database, FileText, Folder, Paperclip, Plus, RefreshCcw, Search } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useKnowledgeBaseData } from "../hooks/usePageData";
import { dataProvider } from "../services/dataProvider";

const DEFAULT_INDEX_STATS = {
  chunks: 1248,
  docs: 36,
  pending: 4,
  progress: "82%",
};

const DOCUMENT_FALLBACKS = [
  { chunks: 128, kind: "md", tag: "requirements", updated: "2m", state: "indexed" },
  { chunks: 74, kind: "puml", tag: "architecture", updated: "12m", state: "indexed" },
  { chunks: 41, kind: "pdf", tag: "reference", updated: "28m", state: "queued" },
  { chunks: 19, kind: "txt", tag: "notes", updated: "1h", state: "failed" },
];

const EMPTY_FILE_TREE = {
  root: {
    children: [],
    id: "knowledge-base-root",
    name: "Knowledge Base",
    readable: false,
    relativePath: "",
    type: "folder",
  },
  source: "local",
  status: "missing",
  total: 0,
};

const DISPLAY_SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi;
const DISPLAY_AUTHORIZATION_PATTERN = /\bAuthorization:\s*Bearer\s+[^\s,;]+/gi;
const DISPLAY_OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]+/g;
const DISPLAY_WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s"']+/g;

function redactDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(DISPLAY_AUTHORIZATION_PATTERN, "[redacted]")
    .replace(DISPLAY_SECRET_ASSIGNMENT_PATTERN, "[redacted]")
    .replace(DISPLAY_OPENAI_KEY_PATTERN, "[redacted]")
    .replace(DISPLAY_WINDOWS_PATH_PATTERN, "[redacted-path]");
}

function cleanDisplayText(value) {
  return redactDisplayText(value).trim();
}

export function getKnowledgeDisplayData(data) {
  return {
    fileTree: data.fileTree ?? EMPTY_FILE_TREE,
    graphNodes: data.graphNodes ?? [],
    indexStats: {
      ...DEFAULT_INDEX_STATS,
      ...(data.indexStats ?? {}),
    },
    knowledgeDocuments: data.knowledgeDocuments ?? [],
    providerStatus: data.providerStatus ?? { message: "Using mock data", status: "mock" },
    sourceHealth: data.sourceHealth ?? { path: "", status: "mock" },
  };
}

export function getKnowledgeDocumentRows(documents = []) {
  return documents.map((doc, index) => ({
    ...DOCUMENT_FALLBACKS[index % DOCUMENT_FALLBACKS.length],
    ...doc,
    kind: doc.kind ?? doc.type ?? DOCUMENT_FALLBACKS[index % DOCUMENT_FALLBACKS.length].kind,
    state: doc.state ?? DOCUMENT_FALLBACKS[index % DOCUMENT_FALLBACKS.length].state,
    tag: doc.tag ?? doc.inferredTags?.[0] ?? DOCUMENT_FALLBACKS[index % DOCUMENT_FALLBACKS.length].tag,
    updated: doc.updated ?? doc.updatedAt ?? DOCUMENT_FALLBACKS[index % DOCUMENT_FALLBACKS.length].updated,
  }));
}

export function filterKnowledgeDocumentRows(rows = [], query = "") {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((doc) => {
    return [
      doc.title,
      doc.relativePath,
      doc.preview,
      doc.excerpt,
      doc.tag,
      doc.type,
      doc.kind,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function filterKnowledgeFileTree(nodes = [], query = "") {
  const normalizedQuery = cleanDisplayText(query).toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const ownMatch = [node.name, node.relativePath, node.ext, node.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      const children = filterKnowledgeFileTree(node.children ?? [], query);

      if (ownMatch) {
        return node;
      }

      if (children.length > 0) {
        return {
          ...node,
          children,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function limitDisplayText(value, maxChars = 480) {
  const text = redactDisplayText(value);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function getKnowledgeAttachmentInput(doc = {}, sessionId = "local-session") {
  return {
    ...(doc.id || doc.documentId ? { documentId: redactDisplayText(doc.documentId ?? doc.id) } : {}),
    ...(doc.chunkId ? { chunkId: redactDisplayText(doc.chunkId) } : {}),
    matchType: redactDisplayText(doc.matchType ?? "document"),
    preview: limitDisplayText(doc.preview ?? doc.excerpt),
    relativePath: redactDisplayText(doc.relativePath ?? doc.path),
    score: Number.isFinite(doc.score) ? doc.score : 1,
    sessionId: redactDisplayText(sessionId) || "local-session",
    sourceType: "knowledge",
    title: redactDisplayText(doc.title ?? doc.name ?? doc.relativePath ?? "Knowledge context"),
    updatedAt: redactDisplayText(doc.updatedAt),
  };
}

export function getKnowledgeFileAttachmentInput(file = {}, sessionId = "local-session", selectedText = "") {
  const selection = cleanDisplayText(selectedText);
  const isSelection = selection.length > 0;
  const documentId = cleanDisplayText(file.documentId ?? file.id);
  const title = cleanDisplayText(file.title ?? file.name ?? file.relativePath ?? "Knowledge context");
  const preview = isSelection
    ? selection
    : cleanDisplayText(file.preview ?? file.excerpt ?? file.summary ?? file.content);

  return {
    ...(isSelection && documentId ? { contextId: `${documentId}:selection` } : {}),
    ...(documentId ? { documentId } : {}),
    matchType: isSelection ? "selection" : "document",
    preview: limitDisplayText(preview),
    relativePath: cleanDisplayText(file.relativePath ?? file.path),
    score: Number.isFinite(file.score) ? file.score : 1,
    sessionId: cleanDisplayText(sessionId) || "local-session",
    sourceType: "knowledge",
    title,
    updatedAt: cleanDisplayText(file.updatedAt),
  };
}

export async function attachKnowledgeDocumentToAgentChat(doc = {}, provider = dataProvider, sessionId = "local-session") {
  return provider.attachKnowledgeContextToAgentChat(getKnowledgeAttachmentInput(doc, sessionId));
}

export function getKnowledgePreviewInput(item = {}) {
  if (!item || item.type === "folder") {
    return null;
  }

  const id = cleanDisplayText(item.documentId ?? item.id);
  const relativePath = cleanDisplayText(item.relativePath ?? item.path);

  return {
    ...(id ? { id } : {}),
    ...(relativePath ? { relativePath } : {}),
  };
}

export function getKnowledgeReaderView(preview = {}, mode = "markdown") {
  const content = redactDisplayText(preview.content ?? preview.preview ?? preview.excerpt ?? "");
  const type = cleanDisplayText(preview.type ?? preview.ext ?? "");
  const relativePath = cleanDisplayText(preview.relativePath ?? "");
  const isMarkdown = type === "md" || type === "markdown" || /\.md(?:$|[?#])/i.test(relativePath);
  const normalizedMode = mode === "raw" ? "raw" : "markdown";

  return {
    content,
    mode: normalizedMode,
    renderAsMarkdown: normalizedMode === "markdown" && isMarkdown,
  };
}

export async function runKnowledgeFullTextSearch(query = "", provider = dataProvider) {
  const normalizedQuery = cleanDisplayText(query);

  if (!normalizedQuery) {
    return {
      query: "",
      results: [],
      status: "empty",
      total: 0,
    };
  }

  return provider.searchKnowledgeLocal(normalizedQuery);
}

function countLabel(value = 0, noun = "item") {
  return `${Number.isFinite(value) ? value : 0} ${noun}`;
}

function getEmbeddingStatusRows(indexStats = {}) {
  const embedding = indexStats.embedding ?? indexStats.embeddingSummary;
  if (!embedding || typeof embedding !== "object") {
    return [];
  }

  const provider = redactDisplayText(embedding.provider ?? "");
  const model = redactDisplayText(embedding.model ?? "");
  const providerStatus = redactDisplayText(embedding.providerStatus ?? indexStats.embeddingStatus ?? "unavailable");
  const providerLabel = provider && model ? `${provider}/${model}` : "keyword";
  const embedded = Number.isFinite(embedding.embedded) ? embedding.embedded : 0;
  const skipped = Number.isFinite(embedding.skipped) ? embedding.skipped : 0;
  const failed = Number.isFinite(embedding.failed) ? embedding.failed : 0;

  return [
    { label: "embedding", value: `${providerLabel} (${providerStatus})` },
    { label: "vectors", value: `${embedded} embedded / ${skipped} skipped` },
    { label: "embedding failed", value: countLabel(failed, "chunk") },
  ];
}

export function getKnowledgeIndexStatusRows(indexStats = {}, providerStatus = {}, sourceHealth = {}, reindexStatus = null) {
  const queue = indexStats.queue ?? indexStats.pending ?? 0;
  const failed = indexStats.failed ?? 0;
  const skipped = indexStats.skipped ?? 0;
  const lastIndexed = indexStats.lastIndexed ?? indexStats.updatedAt ?? "not indexed";
  const rows = [
    { label: "source", value: redactDisplayText(providerStatus.status ?? indexStats.source ?? "unknown") },
    { label: "path", value: redactDisplayText(sourceHealth.path || providerStatus.message || "") },
    { label: "queue", value: `${queue} pending` },
    { label: "failed", value: countLabel(failed, "chunk") },
    { label: "skipped", value: countLabel(skipped, "item") },
    ...getEmbeddingStatusRows(indexStats),
    { label: "last indexed", value: redactDisplayText(lastIndexed) },
  ];

  if (reindexStatus?.status) {
    rows.push({
      label: "reindex",
      value: redactDisplayText(reindexStatus.message ?? reindexStatus.status),
    });
  }

  return rows;
}

export async function runKnowledgeReindex(provider = dataProvider, reload = () => {}) {
  try {
    const result = await provider.startKnowledgeIndex();
    const summary = result?.summary ?? {};
    const embedding = result?.embeddingSummary ?? summary.embedding;
    const embeddingStatus = embedding?.providerStatus
      ? embedding.providerStatus === "ready" && Number.isFinite(embedding.embedded)
        ? ` / ${embedding.embedded} vectors ready`
        : ` / embeddings ${redactDisplayText(embedding.providerStatus)}`
      : "";
    await Promise.resolve(reload());

    return {
      message: `${summary.docs ?? 0} docs / ${summary.chunks ?? 0} chunks${embeddingStatus}`,
      result,
      status: result?.status === "ready" || result?.status === "error" ? "done" : result?.status || "done",
    };
  } catch (error) {
    return {
      message: error?.message || "Reindex unavailable",
      status: "error",
    };
  }
}

function buildFallbackFileTree(documents = []) {
  return {
    ...EMPTY_FILE_TREE,
    root: {
      ...EMPTY_FILE_TREE.root,
      children: documents.map((doc) => ({
        ext: doc.type ?? doc.kind,
        id: doc.id ?? doc.documentId ?? doc.relativePath,
        name: doc.title ?? doc.name ?? doc.relativePath,
        readable: doc.status !== "metadata-only" && doc.state !== "metadata-only",
        relativePath: doc.relativePath,
        size: doc.size ?? 0,
        type: "file",
        updatedAt: doc.updatedAt,
      })).filter((node) => node.relativePath),
    },
    status: documents.length > 0 ? "ready" : "missing",
    total: documents.length,
  };
}

function formatBytes(value = 0) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedTextFromWindow() {
  return globalThis.window?.getSelection?.().toString?.() ?? "";
}

function getInspectorRows(file = {}) {
  if (!file?.relativePath && !file?.title) {
    return [];
  }

  return [
    { label: "name", value: file.title ?? file.name ?? file.relativePath },
    { label: "path", value: file.relativePath },
    { label: "type", value: file.type ?? file.ext ?? "document" },
    { label: "size", value: formatBytes(file.size) },
    { label: "updated", value: file.updatedAt ?? "unknown" },
    { label: "readable", value: file.readable === false ? "unreadable" : "readable" },
  ].filter((row) => row.value !== undefined && row.value !== null && row.value !== "");
}

function hasHtmlTags(text) {
  return /<[a-zA-Z][\s\S]*?>/.test(text);
}

function renderMarkdownInline(text = "", imageMap = null) {
  if (!text) return text;

  // If text contains HTML tags, parse them with html-react-parser
  if (hasHtmlTags(text)) {
    try {
      return parseHtml(text, {
        replace: (domNode) => {
          if (domNode.type === "tag" && domNode.name === "img") {
            const src = domNode.attribs?.src || "";
            const alt = domNode.attribs?.alt || "";
            const width = domNode.attribs?.width;
            const dataUrl = imageMap?.[src] ?? null;
            const resolvedSrc = dataUrl || src;
            return (
              <img
                src={resolvedSrc}
                alt={alt}
                loading="lazy"
                style={width ? { width } : undefined}
              />
            );
          }
          return undefined;
        },
      });
    } catch {
      // fallback to plain text
    }
  }

  // Pure markdown inline parsing
  const parts = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\*\*([^*\n]+)\*\*|`([^`]+)`/g;
  let cursor = 0;
  let match;
  let keyIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      const alt = match[1] || "";
      const imgPath = match[2];
      const dataUrl = imageMap?.[imgPath] ?? null;
      parts.push(
        <span key={`img-${keyIndex++}`} className="kb-inline-image">
          {dataUrl
            ? <img src={dataUrl} alt={alt} loading="lazy" />
            : <span className="kb-image-placeholder">[{alt || imgPath}]</span>
          }
        </span>,
      );
    } else if (match[3] !== undefined) {
      parts.push(<strong key={`strong-${keyIndex++}`}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      parts.push(<code key={`code-${keyIndex++}`}>{match[4]}</code>);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : text;
}

function renderMarkdownBlock(block, index, imageMap = null) {
  const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const heading = lines[0]?.match(/^(#{1,3})\s+(.+)/);

  if (heading) {
    const Tag = heading[1].length === 1 ? "h2" : "h3";
    const rest = lines.slice(1).join("\n");

    return (
      <React.Fragment key={`heading-${index}`}>
        <Tag>{renderMarkdownInline(heading[2], imageMap)}</Tag>
        {rest ? renderMarkdownBlock(rest, `${index}-rest`, imageMap) : null}
      </React.Fragment>
    );
  }

  // Block is primarily HTML (e.g. <div> with <img>)
  if (hasHtmlTags(block)) {
    return <div key={`html-${index}`}>{renderMarkdownInline(block, imageMap)}</div>;
  }

  // Standalone image on its own line: ![alt](path)
  const standaloneImage = lines.length === 1 && lines[0].match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (standaloneImage) {
    const alt = standaloneImage[1] || "";
    const imgPath = standaloneImage[2];
    const dataUrl = imageMap?.[imgPath] ?? null;
    return (
      <div key={`img-block-${index}`} className="kb-block-image">
        {dataUrl
          ? <img src={dataUrl} alt={alt} loading="lazy" />
          : <span className="kb-image-placeholder">[{alt || imgPath}]</span>
        }
      </div>
    );
  }

  if (/^[-*]\s+/m.test(block)) {
    return (
      <ul key={`list-${index}`}>
        {lines.map((line) => line.replace(/^[-*]\s+/, "")).map((line) => (
          <li key={line}>{renderMarkdownInline(line, imageMap)}</li>
        ))}
      </ul>
    );
  }

  return <p key={`p-${index}`}>{renderMarkdownInline(block, imageMap)}</p>;
}

function splitIntoBlocks(content) {
  const codeBlocks = [];
  const processed = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ language: lang, code: code.replace(/\n$/, "") });
    return `\n\n__CODE_BLOCK_${index}__\n\n`;
  });

  const rawBlocks = processed.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return rawBlocks.map((block) => {
    const m = block.match(/^__CODE_BLOCK_(\d+)__$/);
    if (m) return codeBlocks[parseInt(m[1])];
    return block;
  });
}

function extractImagePaths(content) {
  const paths = [];
  // HTML img tags
  const htmlPattern = /<img[^>]+src="([^"]+)"/g;
  let match;
  while ((match = htmlPattern.exec(content)) !== null) {
    const src = match[1];
    if (src && !src.startsWith("http") && !src.startsWith("data:")) {
      paths.push(src);
    }
  }
  // Markdown images
  const mdPattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = mdPattern.exec(content)) !== null) {
    const src = match[1];
    if (src && !src.startsWith("http") && !src.startsWith("data:")) {
      paths.push(src);
    }
  }
  return [...new Set(paths)];
}

export function MarkdownBlocks({ content, documentDir }) {
  const [imageMap, setImageMap] = React.useState(null);
  const blocks = splitIntoBlocks(content);

  React.useEffect(() => {
    if (!documentDir) return;
    const imagePaths = extractImagePaths(content);
    if (imagePaths.length === 0) return;

    let cancelled = false;
    const loadImages = async () => {
      const map = {};
      await Promise.all(imagePaths.map(async (imgPath) => {
        const resolvedPath = documentDir
          ? `${documentDir}/${imgPath}`.replace(/\\/g, "/").replace(/\/+/g, "/")
          : imgPath;
        try {
          const result = await dataProvider.getKnowledgeDocumentImage({ relativePath: resolvedPath });
          if (!cancelled && result?.dataUrl) {
            map[imgPath] = result.dataUrl;
          }
        } catch {
          // image not found, leave as placeholder
        }
      }));
      if (!cancelled && Object.keys(map).length > 0) {
        setImageMap(map);
      }
    };
    loadImages();
    return () => { cancelled = true; };
  }, [content, documentDir]);

  return (
    <div className="kb-markdown">
      {blocks.length === 0 ? (
        <p>No readable content.</p>
      ) : (
        blocks.map((block, index) => {
          if (typeof block === "object" && block.code !== undefined) {
            return (
              <pre key={`code-${index}`}>
                <code className={block.language ? `language-${block.language}` : ""}>
                  {block.code}
                </code>
              </pre>
            );
          }
          return renderMarkdownBlock(block, index, imageMap);
        })
      )}
    </div>
  );
}

function FileTreeNode({ activePath, level = 0, node, onOpen }) {
  if (node.type === "folder") {
    return (
      <details className="kb-tree-folder" open>
        <summary style={{ "--depth": level }}>
          <Folder size={15} />
          <span>{node.name}</span>
        </summary>
        <div>
          {(node.children ?? []).map((child) => (
            <FileTreeNode activePath={activePath} key={child.id ?? child.relativePath} level={level + 1} node={child} onOpen={onOpen} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <button
      className={`kb-tree-file ${activePath === node.relativePath ? "active" : ""} ${node.readable === false ? "unreadable" : ""}`}
      onClick={() => onOpen(node)}
      style={{ "--depth": level }}
      type="button"
    >
      <FileText size={15} />
      <span>{node.name}</span>
      <small>{node.ext ?? "file"}</small>
    </button>
  );
}

export function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [centerMode, setCenterMode] = useState("reader");
  const [readerMode, setReaderMode] = useState("markdown");
  const [currentFile, setCurrentFile] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [reindexStatus, setReindexStatus] = useState(null);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [attachStatus, setAttachStatus] = useState(null);
  const [openStatus, setOpenStatus] = useState(null);
  const readerRef = useRef(null);
  const { data, reload } = useKnowledgeBaseData();
  const { fileTree, indexStats, knowledgeDocuments, providerStatus, sourceHealth } = getKnowledgeDisplayData(data);
  const documentRows = getKnowledgeDocumentRows(knowledgeDocuments);
  const treeData = fileTree?.root ? fileTree : buildFallbackFileTree(documentRows);
  const visibleTree = useMemo(
    () => filterKnowledgeFileTree(treeData.root.children ?? [], searchQuery),
    [treeData.root.children, searchQuery],
  );
  const indexStatusRows = getKnowledgeIndexStatusRows(indexStats, providerStatus, sourceHealth, reindexStatus);
  const readerView = getKnowledgeReaderView(currentFile ?? {}, readerMode);
  const inspectorRows = getInspectorRows(currentFile);

  const handleReindex = async () => {
    if (reindexBusy) {
      return;
    }

    setReindexBusy(true);
    setReindexStatus({ message: "Indexing docs and embeddings...", status: "running" });
    const result = await runKnowledgeReindex(dataProvider, reload);
    setReindexStatus(result);
    setReindexBusy(false);
  };

  const handleOpenFile = async (item) => {
    const input = getKnowledgePreviewInput(item);
    if (!input) {
      return;
    }

    setOpenStatus({ message: "Opening file...", status: "running" });
    try {
      const preview = await dataProvider.getKnowledgeDocumentPreview(input);
      setCurrentFile(preview);
      setCenterMode("reader");
      setOpenStatus(null);
    } catch (error) {
      setCurrentFile({
        ...item,
        content: "",
        message: error?.message || "Could not open this file.",
        readable: false,
        status: "error",
      });
      setCenterMode("reader");
      setOpenStatus({ message: error?.message || "Open failed", status: "error" });
    }
  };

  const handleFullSearch = async (event) => {
    event?.preventDefault?.();
    setSearchResult({ query: searchQuery.trim(), results: [], status: "running", total: 0 });
    const result = await runKnowledgeFullTextSearch(searchQuery, dataProvider);
    setSearchResult(result);
    setCenterMode("results");
  };

  const handleAttachCurrentFile = async () => {
    if (!currentFile) {
      setAttachStatus({ message: "Open a file first", status: "idle" });
      return;
    }

    const selectedText = selectedTextFromWindow();
    const input = getKnowledgeFileAttachmentInput(currentFile, "local-session", selectedText);
    setAttachStatus({ message: "Attaching context...", status: "running" });
    try {
      const result = await dataProvider.attachKnowledgeContextToAgentChat(input);
      setAttachStatus({
        message: `${result.attachedKnowledgeContexts?.length ?? 1} context attached`,
        status: result.status ?? "saved",
      });
    } catch (error) {
      setAttachStatus({ message: error?.message || "Attach unavailable", status: "error" });
    }
  };

  const handleAttachResult = async (result) => {
    setAttachStatus({ message: "Attaching search result...", status: "running" });
    try {
      const attach = await attachKnowledgeDocumentToAgentChat(result, dataProvider, "local-session");
      setAttachStatus({
        message: `${attach.attachedKnowledgeContexts?.length ?? 1} context attached`,
        status: attach.status ?? "saved",
      });
    } catch (error) {
      setAttachStatus({ message: error?.message || "Attach unavailable", status: "error" });
    }
  };

  return (
    <PageFrame
      eyebrow="Knowledge Library"
      title="Knowledge Base"
      subtitle="Browse, read, search, and attach local knowledge safely"
      actions={
        <>
          <button className="soft-button" type="button">
            <Plus size={15} />
            Import
          </button>
          <button className="soft-button muted" disabled={reindexBusy} onClick={handleReindex} type="button">
            <RefreshCcw size={15} />
            {reindexBusy ? "Indexing..." : "Reindex"}
          </button>
          <span className="settings-save-state">
            {attachStatus?.message ?? openStatus?.message ?? reindexStatus?.message ?? indexStats.status ?? "ready"}
          </span>
        </>
      }
    >
      <div className="kb-reader-layout">
        <GlassPanel className="kb-tree-panel">
          <PanelHeader icon={Folder} title="File tree" aside={`${treeData.total ?? visibleTree.length} items`} />
          <form className="kb-search-form" onSubmit={handleFullSearch}>
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Filter Knowledge file tree"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter files, Enter for full search"
                type="search"
                value={searchQuery}
              />
            </div>
            <button className="soft-button muted" type="submit">全文搜索</button>
          </form>
          <div className="kb-tree-list">
            {visibleTree.length === 0 ? (
              <EmptyState
                title={treeData.root.children?.length === 0 ? "No files found" : "No matching files"}
                detail={treeData.root.children?.length === 0 ? "Choose a Knowledge Base folder in Settings." : "Try another file name or path."}
              />
            ) : (
              visibleTree.map((node) => (
                <FileTreeNode activePath={currentFile?.relativePath} key={node.id ?? node.relativePath} node={node} onOpen={handleOpenFile} />
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="kb-reader-panel">
          {centerMode === "results" ? (
            <>
              <PanelHeader icon={Search} title="Full-text results" aside={`${searchResult?.total ?? 0} matches`} />
              <div className="kb-result-list">
                {searchResult?.status === "running" ? (
                  <EmptyState title="Searching Knowledge Base" detail="Checking local index and text matches." />
                ) : (searchResult?.results ?? []).length === 0 ? (
                  <EmptyState title="No search results" detail="Press Enter or use another full-text query." />
                ) : (
                  searchResult.results.map((result) => (
                    <div className="kb-search-result" key={result.chunkId ?? result.id ?? result.relativePath}>
                      <button onClick={() => handleOpenFile(result)} type="button">
                        <strong>{redactDisplayText(result.title ?? result.relativePath)}</strong>
                        <small>{redactDisplayText(result.relativePath)}</small>
                        <span>{limitDisplayText(result.preview ?? result.excerpt, 220)}</span>
                      </button>
                      <button
                        aria-label={`Attach ${result.title ?? result.relativePath} to Agent Chat`}
                        className="icon-button ghost"
                        onClick={() => handleAttachResult(result)}
                        type="button"
                      >
                        <Paperclip size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <PanelHeader
                icon={BookOpen}
                title="Reader"
                aside={currentFile?.relativePath ? redactDisplayText(currentFile.relativePath) : "no file open"}
              />
              <div className="kb-reader-toolbar">
                <div className="kb-mode-toggle" role="group" aria-label="Reader mode">
                  <button className={readerMode === "markdown" ? "active" : ""} onClick={() => setReaderMode("markdown")} type="button">
                    Markdown
                  </button>
                  <button className={readerMode === "raw" ? "active" : ""} onClick={() => setReaderMode("raw")} type="button">
                    Raw
                  </button>
                </div>
                {currentFile?.truncated ? <span>Preview truncated</span> : null}
              </div>
              <div className="kb-reader-body" ref={readerRef}>
                {!currentFile ? (
                  <EmptyState title="Select a file to read" detail="Use the file tree or full-text results to open a source." />
                ) : currentFile.readable === false ? (
                  <EmptyState title="Preview unavailable" detail={currentFile.message ?? "This file is available as metadata only."} />
                ) : readerView.renderAsMarkdown ? (
                  <MarkdownBlocks
                    content={readerView.content}
                    documentDir={currentFile?.relativePath ? currentFile.relativePath.replace(/[\\/][^\\/]+$/, "") : ""}
                  />
                ) : (
                  <pre>{readerView.content || "No readable content."}</pre>
                )}
              </div>
            </>
          )}
        </GlassPanel>

        <GlassPanel className="kb-inspector-panel">
          <PanelHeader icon={FileText} title="Inspector" aside={currentFile?.readable === false ? "metadata" : "reader"} />
          {inspectorRows.length === 0 ? (
            <EmptyState title="No file selected" detail="Open a file to inspect metadata and attach context." />
          ) : (
            <div className="kb-inspector-list">
              {inspectorRows.map((row) => (
                <div className="kb-inspector-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{redactDisplayText(String(row.value))}</strong>
                </div>
              ))}
            </div>
          )}
          <button className="soft-button kb-attach-button" disabled={!currentFile} onClick={handleAttachCurrentFile} type="button">
            <Paperclip size={15} />
            Attach
          </button>
          <details className="kb-index-health">
            <summary>
              <Database size={15} />
              Index Health
            </summary>
            <div className="index-stats compact">
              <div>
                <strong>{indexStats.docs}</strong>
                <span>docs</span>
              </div>
              <div>
                <strong>{indexStats.chunks.toLocaleString()}</strong>
                <span>chunks</span>
              </div>
              <div>
                <strong>{indexStats.failed ?? 0}</strong>
                <span>failed</span>
              </div>
            </div>
            <div className="index-provider-list compact">
              {indexStatusRows.map((row) => (
                <span key={row.label}>{row.label}: {row.value}</span>
              ))}
            </div>
          </details>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
