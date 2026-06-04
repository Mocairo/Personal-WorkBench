import React from "react";
import {
  ChevronDown,
  FileCode2,
  FileText,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  Network,
} from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useCodeRepositoryData } from "../hooks/usePageData";

const DEFAULT_REPO_METRICS = {
  modules: 28,
  symbols: 412,
  changed: 2,
};

const DEFAULT_GIT_STATE = {
  branch: "main",
  modified: 2,
  staged: 0,
  statusLabel: "2 changes",
  untracked: 0,
};

export function getRepositoryDisplayData(data) {
  const gitState = {
    ...DEFAULT_GIT_STATE,
    ...(data.gitState ?? {}),
  };
  const hasBadBranch = gitState.branch === "not a repository" || gitState.statusLabel === "unavailable";

  return {
    providerStatus: data.providerStatus ?? { message: "Using mock data", status: "mock" },
    repoFiles: data.repoFiles ?? [],
    repoMetrics: {
      ...DEFAULT_REPO_METRICS,
      ...(data.repoMetrics ?? {}),
    },
    repositorySource: data.repositorySource ?? { status: "mock" },
    scanSummary: data.scanSummary ?? { scanned: 0, skipped: 0, status: "mock" },
    sourceHealth: data.sourceHealth ?? { path: "", status: "mock" },
    structureNodes: data.structureNodes ?? [],
    gitState: {
      ...gitState,
      branch: hasBadBranch ? "local root" : gitState.branch,
      statusLabel: hasBadBranch ? "scan ready" : gitState.statusLabel,
    },
  };
}

function getTreeIconType(file) {
  if (file.icon) {
    return file.icon;
  }

  if (file.meta === "directory" || file.type === "directory") {
    return "folder";
  }

  return /\.(js|jsx|ts|tsx|py|json)$/i.test(file.name) ? "code" : "file";
}

export function getRepositoryTreeRows(repoFiles = []) {
  return repoFiles.map((file, index) => ({
    depth: file.depth ?? 0,
    icon: getTreeIconType(file),
    language: file.language ?? "",
    meta: file.meta ?? file.language ?? file.type ?? "file",
    name: file.name,
    relativePath: file.relativePath ?? file.name,
    state: file.state ?? file.gitState ?? (index === 0 ? "selected" : "clean"),
  }));
}

function TreeIcon({ type }) {
  if (type === "folder") {
    return <FolderOpen size={14} />;
  }
  if (type === "code") {
    return <FileCode2 size={14} />;
  }
  return <FileText size={14} />;
}

export function CodeRepository() {
  const { data } = useCodeRepositoryData();
  const { gitState, providerStatus, repoFiles, repoMetrics, scanSummary, sourceHealth, structureNodes } = getRepositoryDisplayData(data);
  const treeRows = getRepositoryTreeRows(repoFiles);
  const dependencyEdges = Math.max(3, Math.min(9, treeRows.length - 1));
  const mapNodes = structureNodes.length > 0 ? structureNodes.slice(0, 5) : [
    { label: "Shell" },
    { label: "Registry" },
    { label: "State" },
    { label: "Pages" },
    { label: "Services" },
  ];

  return (
    <PageFrame
      eyebrow="Repository"
      title="Code Repository"
      subtitle="Local repository workspace"
      actions={
        <>
          <button className="soft-button" type="button">
            <GitBranch size={15} />
            Scan
          </button>
          <button className="soft-button muted" type="button">
            <FolderOpen size={15} />
            Open Root
          </button>
        </>
      }
    >
      <div className="code-layout">
        <GlassPanel className="project-tree">
          <PanelHeader icon={FolderGit2} title="Project tree" aside="local" />
          {repoFiles.length === 0 ? (
            <EmptyState title="No repository files" detail="Choose a repository folder in Settings." />
          ) : (
            treeRows.map((file) => (
              <div className={`tree-row rich ${file.state}`} key={`${file.depth}-${file.name}`} style={{ "--depth": file.depth }}>
                <ChevronDown size={13} />
                <TreeIcon type={file.icon} />
                <span>{file.name}</span>
                <small>{file.meta}</small>
                <em>{file.state}</em>
              </div>
            ))
          )}
        </GlassPanel>

        <GlassPanel className="repo-overview">
          <PanelHeader icon={Gauge} title="Repository pulse" aside={gitState.statusLabel} />
          <div className="repo-metrics">
            <div>
              <strong>{repoMetrics.modules}</strong>
              <span>modules</span>
            </div>
            <div>
              <strong>{repoMetrics.symbols}</strong>
              <span>symbols</span>
            </div>
            <div>
              <strong>{repoMetrics.changed}</strong>
              <span>changed</span>
            </div>
          </div>
          <div className="git-strip">
            <span>{gitState.branch}</span>
            <i />
            <span>{providerStatus.status}</span>
            <span>{gitState.modified} modified</span>
            <span>{gitState.staged} staged</span>
            <span>{gitState.untracked ?? 0} untracked</span>
          </div>
          <div className="language-ratio">
            <span style={{ "--value": "52%" }}>React</span>
            <span style={{ "--value": "31%" }}>Electron</span>
            <span style={{ "--value": "17%" }}>CSS</span>
          </div>
        </GlassPanel>

        <GlassPanel className="structure-panel">
          <PanelHeader icon={Network} title="Module graph" aside={`scanned ${scanSummary.scanned ?? 0}`} />
          {repoFiles.length === 0 ? (
            <EmptyState title="No structure preview" detail="Repository scan has no files to visualize." />
          ) : (
            <>
              <div className="code-map">
                <span className="map-link one" />
                <span className="map-link two" />
                <span className="map-link three" />
                <span className="map-block a">{mapNodes[0]?.label ?? "Shell"}</span>
                <span className="map-block b">{mapNodes[1]?.label ?? "Registry"}</span>
                <span className="map-block c">{mapNodes[2]?.label ?? "State"}</span>
                <span className="map-block d">{mapNodes[3]?.label ?? "Pages"}</span>
                <span className="map-block e">{mapNodes[4]?.label ?? "Services"}</span>
              </div>
              <div className="scan-summary">
                <span>{repoMetrics.modules} modules scanned</span>
                <span>{repoMetrics.symbols} symbols</span>
                <span>{sourceHealth.path || providerStatus.message}</span>
                <span>{dependencyEdges} dependency edges</span>
              </div>
            </>
          )}
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
