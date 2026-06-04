import React, { useState } from "react";
import { Circle, Database, FileText, Network, Plus, RefreshCcw, Search } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useKnowledgeBaseData } from "../hooks/usePageData";

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

export function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data } = useKnowledgeBaseData();
  const { graphNodes, indexStats, knowledgeDocuments, providerStatus, sourceHealth } = getKnowledgeDisplayData(data);
  const documentRows = getKnowledgeDocumentRows(knowledgeDocuments);
  const visibleDocumentRows = filterKnowledgeDocumentRows(documentRows, searchQuery);
  const selectedNode = graphNodes[0] ?? "No node";
  const embeddingProvider = indexStats.embeddingProvider ?? "local/bge-small";
  const failed = indexStats.failed ?? 1;
  const queue = indexStats.queue ?? indexStats.pending;
  const lastIndexed = indexStats.lastIndexed ?? "2m ago";

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
          <button className="soft-button muted" type="button">
            <RefreshCcw size={15} />
            Reindex
          </button>
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
              visibleDocumentRows.map((doc) => (
                <div className={`document-row rich ${doc.state}`} key={doc.id ?? doc.relativePath ?? doc.title}>
                  <FileText size={17} />
                  <div>
                    <strong>{doc.title}</strong>
                    <small>
                      {doc.kind} / {doc.tag} / {doc.chunks} chunks / {doc.updated}
                    </small>
                  </div>
                  <span>{doc.state}</span>
                </div>
              ))
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
              embedding: {embeddingProvider}
            </span>
            <span>source: {providerStatus.status}</span>
            <span>path: {sourceHealth.path || providerStatus.message}</span>
            <span>queue: {queue} pending</span>
            <span>failed: {failed} chunk</span>
            <span>last indexed: {lastIndexed}</span>
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
