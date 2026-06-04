import React from "react";
import { Archive, FileText, Gauge, Globe2, Inbox, Radio } from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useIntelCenterData } from "../hooks/usePageData";

const SOURCE_FALLBACK_STATES = ["enabled", "enabled", "paused", "error"];
const TASK_FALLBACK_STATES = ["fetching", "normalizing", "deduplicating", "summarizing"];
const CARD_FALLBACK_META = [
  { confidence: "91%", tags: "runtime, local", time: "09:42", state: "summary ready" },
  { confidence: "84%", tags: "policy, tools", time: "10:18", state: "draft" },
  { confidence: "76%", tags: "repo, scan", time: "11:03", state: "queued" },
];

function normalizeSource(source, index) {
  if (source && typeof source === "object") {
    return {
      checks: source.value ?? source.checks ?? `${index + 2} checks today`,
      label: source.label ?? source.name ?? source.source ?? "local source",
      state: source.state ?? source.status ?? SOURCE_FALLBACK_STATES[index % SOURCE_FALLBACK_STATES.length],
    };
  }

  return {
    checks: `${index + 2} checks today`,
    label: source,
    state: SOURCE_FALLBACK_STATES[index % SOURCE_FALLBACK_STATES.length],
  };
}

function normalizeCollectionStep(step, index) {
  if (step && typeof step === "object") {
    return {
      count: step.count,
      label: step.label ?? step.name ?? step.title ?? TASK_FALLBACK_STATES[index % TASK_FALLBACK_STATES.length],
      progress: step.progress ?? `${88 - index * 12}%`,
      state: step.state ?? step.status ?? TASK_FALLBACK_STATES[index % TASK_FALLBACK_STATES.length],
    };
  }

  return {
    label: step,
    progress: `${88 - index * 12}%`,
    state: TASK_FALLBACK_STATES[index % TASK_FALLBACK_STATES.length],
  };
}

export function getIntelDisplayData(data) {
  return {
    collectionSteps: (data.collectionSteps ?? []).map(normalizeCollectionStep),
    intelCards: (data.intelCards ?? []).map((card, index) => ({
      ...CARD_FALLBACK_META[index % CARD_FALLBACK_META.length],
      ...card,
      excerpt: card.excerpt ?? card.summary ?? "",
      tags: Array.isArray(card.tags) ? card.tags.join(", ") : card.tags ?? CARD_FALLBACK_META[index % CARD_FALLBACK_META.length].tags,
      time: card.time ?? card.updatedAt ?? CARD_FALLBACK_META[index % CARD_FALLBACK_META.length].time,
      state: card.state ?? card.summaryState ?? CARD_FALLBACK_META[index % CARD_FALLBACK_META.length].state,
    })),
    intelSources: (data.intelSources ?? []).map(normalizeSource),
    providerStatus: data.providerStatus ?? { message: "Using mock data", status: "mock" },
    sourceHealth: data.sourceHealth ?? { path: "", status: "mock" },
  };
}

export function IntelCenter() {
  const { data } = useIntelCenterData();
  const { collectionSteps, intelCards, intelSources, providerStatus, sourceHealth } = getIntelDisplayData(data);

  return (
    <PageFrame
      eyebrow="Local Intel"
      title="情报中心"
      subtitle="Local intel workspace"
      actions={
        <>
          <button className="soft-button" type="button">
            <Globe2 size={15} />
            Sources
          </button>
          <button className="soft-button muted" type="button">
            <FileText size={15} />
            Report
          </button>
        </>
      }
    >
      <div className="intel-layout">
        <GlassPanel className="sources-panel">
          <PanelHeader icon={Radio} title="Sources" aside="local" />
          <div className={`source-row ${providerStatus.status}`}>
            <span className="source-light" />
            <div>
              <strong>local-intel path</strong>
              <small>{sourceHealth.path || providerStatus.message}</small>
            </div>
          </div>
          {intelSources.map((source) => (
            <div className={`source-row ${source.state}`} key={source.label}>
              <span className="source-light" />
              <div>
                <strong>{source.label}</strong>
                <small>
                  {source.state} / {source.checks}
                </small>
              </div>
            </div>
          ))}
        </GlassPanel>

        <GlassPanel className="intel-cards">
          <PanelHeader icon={Inbox} title="Intel inbox" aside={`${intelCards.length} active`} />
          {intelCards.map((card) => (
            <article className="intel-card" key={card.title}>
              <div className="intel-card-head">
                <span>{card.priority}</span>
                <small>{card.time}</small>
              </div>
              <h2>{card.title}</h2>
              <p>{card.excerpt || `${card.source} / ${card.state}`}</p>
              <div className="intel-card-meta">
                <span>{card.confidence} confidence</span>
                <span>{card.tags}</span>
                <button type="button">
                  <Archive size={13} />
                  Archive
                </button>
              </div>
            </article>
          ))}
        </GlassPanel>

        <GlassPanel className="collection-panel">
          <PanelHeader icon={Gauge} title="Report pipeline" aside="running" />
          <div className="collection-stack task-flow">
            {collectionSteps.map((step, index) => (
              <div className={index === 1 ? "active" : ""} key={`${step.state}-${step.label}`}>
                <span>{step.state}</span>
                <small>{step.label}</small>
                <i style={{ "--value": step.progress }} />
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
