import React, { useState } from "react";
import { Circle, Database, FileText, Network, Paperclip, Plus, RefreshCcw, Search } from "lucide-react";
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

export function getKnowledgeDisplayData(data) {
  return {
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

export async function attachKnowledgeDocumentToAgentChat(doc = {}, provider = dataProvider, sessionId = "local-session") {
  return provider.attachKnowledgeContextToAgentChat(getKnowledgeAttachmentInput(doc, sessionId));
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

export function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [reindexStatus, setReindexStatus] = useState(null);
  const [reindexBusy, setReindexBusy] = useState(false);
  const [attachStatus, setAttachStatus] = useState(null);
  const [attachedIds, setAttachedIds] = useState(() => new Set());
  const { data, reload } = useKnowledgeBaseData();
  const { graphNodes, indexStats, knowledgeDocuments, providerStatus, sourceHealth } = getKnowledgeDisplayData(data);
  const documentRows = getKnowledgeDocumentRows(knowledgeDocuments);
  const visibleDocumentRows = filterKnowledgeDocumentRows(documentRows, searchQuery);
  const selectedNode = graphNodes[0] ?? "No node";
  const indexMode = indexStats.embeddingProvider ?? "keyword";
  const indexStatusRows = getKnowledgeIndexStatusRows(indexStats, providerStatus, sourceHealth, reindexStatus);

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

  const handleAttachDocument = async (doc) => {
    const docId = doc.id ?? doc.documentId ?? doc.relativePath ?? doc.title;
    setAttachStatus({ message: "Attaching context...", status: "running" });
    try {
      const result = await attachKnowledgeDocumentToAgentChat(doc, dataProvider, "local-session");
      setAttachedIds((current) => new Set([...current, docId]));
      setAttachStatus({
        message: `${result.attachedKnowledgeContexts?.length ?? 1} context attached`,
        status: result.status ?? "saved",
      });
    } catch (error) {
      setAttachStatus({ message: error?.message || "Attach unavailable", status: "error" });
    }
  };

  return (
    <PageFrame
      eyebrow="RAG Workspace"
      title="Knowledge Base"
      subtitle="Local knowledge workspace"
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
            {attachStatus?.message ?? reindexStatus?.message ?? indexStats.status ?? "index local"}
          </span>
        </>
      }
    >
      <div className="knowledge-grid">
        <GlassPanel className="doc-list-panel">
          <div className="knowledge-mode-strip">
            <span>semantic</span>
            <span>keyword</span>
            <span>chunks</span>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search knowledge documents"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search local notes, docs and chunks"
              type="search"
              value={searchQuery}
            />
            <span className="search-count">{visibleDocumentRows.length}/{documentRows.length}</span>
          </div>
          <div className="document-list">
            {visibleDocumentRows.length === 0 ? (
              <EmptyState
                title={documentRows.length === 0 ? "No documents indexed" : "No matching documents"}
                detail={documentRows.length === 0 ? "Choose a knowledge folder in Settings." : "Try another local keyword."}
              />
            ) : (
              visibleDocumentRows.map((doc) => {
                const docKey = doc.id ?? doc.documentId ?? doc.relativePath ?? doc.title;
                return (
                <div className={`document-row rich ${doc.state}`} key={docKey}>
                  <FileText size={17} />
                  <div>
                    <strong>{doc.title}</strong>
                    <small>
                      {doc.kind} / {doc.tag} / {doc.chunks} chunks / {doc.updated}
                    </small>
                  </div>
                  <span>{attachedIds.has(docKey) ? "attached" : doc.state}</span>
                  <button
                    aria-label={`Attach ${doc.title} to Agent Chat`}
                    className="icon-button ghost"
                    onClick={() => handleAttachDocument(doc)}
                    type="button"
                  >
                    <Paperclip size={14} />
                  </button>
                </div>
                );
              })
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="graph-panel">
          <PanelHeader icon={Network} title="Knowledge graph" aside={`selected: ${selectedNode}`} />
          <div className="knowledge-graph">
            {graphNodes.length === 0 ? (
              <EmptyState title="No graph yet" detail="Index documents to generate graph nodes." />
            ) : (
              graphNodes.map((node, index) => (
                <span className={`graph-node n${index + 1} ${index === 0 ? "selected" : ""}`} key={node}>
                  {node}
                </span>
              ))
            )}
            <svg viewBox="0 0 500 300" role="presentation">
              <path d="M110 76 C180 40 250 42 340 72" />
              <path d="M170 198 C230 130 315 132 388 180" />
              <path d="M126 86 C120 160 148 208 230 230" />
              <path d="M342 78 C392 116 405 146 392 180" />
              <path d="M232 230 C282 250 350 230 388 180" />
            </svg>
            <div className="graph-detail">
              <strong>{selectedNode}</strong>
              <span>{Math.max(1, Math.min(documentRows.length, 5))} related docs</span>
              <span>{Math.max(indexStats.chunks, documentRows.length)} linked chunks</span>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="index-panel">
          <PanelHeader icon={Circle} title="Index state" aside="2 workers" />
          <div className="index-meter">
            <span style={{ "--value": indexStats.progress }} />
          </div>
          <div className="index-stats">
            <div>
              <strong>{indexStats.chunks.toLocaleString()}</strong>
              <span>chunks</span>
            </div>
            <div>
              <strong>{indexStats.docs}</strong>
              <span>docs</span>
            </div>
            <div>
              <strong>{indexStats.pending}</strong>
              <span>pending</span>
            </div>
          </div>
          <div className="index-provider-list">
            <span>
              <Database size={14} />
              index: {indexMode}
            </span>
            {indexStatusRows.map((row) => (
              <span key={row.label}>{row.label}: {row.value}</span>
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
