import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderCog,
  RefreshCcw,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PanelHeader } from "../components/ui/PanelHeader";
import { selectSettingsSourcePath, useSettingsData } from "../hooks/usePageData";
import {
  buildLlmModelProfile,
  buildLlmProviderProfile,
  buildSecretStatus,
} from "../shared/llmSecurityContracts";
import { isRequiredSource } from "../shared/sourceStatus";

const EMPTY_SUMMARY = {
  mock: 0,
  missing: 0,
  ready: 0,
  total: 0,
  unconfigured: 0,
  unreadable: 0,
};

const DEFAULT_SECRETS = [
  buildSecretStatus({
    id: "llm-provider",
    label: "LLM Provider",
    provider: "openai-compatible",
    status: "unconfigured",
  }),
];

const DEFAULT_LLM_PROVIDERS = [
  buildLlmProviderProfile({
    id: "openai-compatible",
    label: "OpenAI-compatible",
    model: "not configured",
    provider: "openai-compatible",
    status: "unconfigured",
  }),
];

const DEFAULT_LLM_MODELS = [
  buildLlmModelProfile({
    label: "Model status",
    model: "not configured",
    provider: "openai-compatible",
    status: "unconfigured",
  }),
];

export function getSettingsDisplayData(data = {}) {
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const secrets = Array.isArray(data.secrets) && data.secrets.length > 0
    ? data.secrets.map(buildSecretStatus)
    : DEFAULT_SECRETS;
  const llmProviders = Array.isArray(data.llmProviders) && data.llmProviders.length > 0
    ? data.llmProviders.map(buildLlmProviderProfile)
    : DEFAULT_LLM_PROVIDERS;
  const llmModels = Array.isArray(data.llmModels) && data.llmModels.length > 0
    ? data.llmModels.map(buildLlmModelProfile)
    : DEFAULT_LLM_MODELS;

  return {
    llmModels,
    llmProviders,
    optionalSources: sources.filter((source) => !isRequiredSource(source)),
    requiredSources: sources.filter(isRequiredSource),
    secrets,
    sources,
    summary: {
      ...EMPTY_SUMMARY,
      ...(data.summary ?? {}),
    },
  };
}

function StatusIcon({ state }) {
  return state === "ready" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />;
}

export function SettingsContent() {
  const { data, loading, reload } = useSettingsData();
  const [busySourceId, setBusySourceId] = useState(null);
  const [statusText, setStatusText] = useState("saved on selection");
  const { llmModels, llmProviders, optionalSources, requiredSources, secrets, summary } = getSettingsDisplayData(data);

  const chooseSourcePath = async (source) => {
    setBusySourceId(source.id);
    setStatusText("opening picker");

    try {
      const result = await selectSettingsSourcePath(undefined, source.id);
      setStatusText(result?.canceled ? "selection canceled" : "saved on selection");
      reload();
    } catch (error) {
      setStatusText(error?.message ?? "selection failed");
    } finally {
      setBusySourceId(null);
    }
  };

  return (
    <>
      <div className="settings-panel-actions">
        <button className="soft-button" onClick={reload} disabled={loading} type="button">
          <RefreshCcw size={15} />
          Sync sources
        </button>
        <span className="settings-save-state">
          <FolderCog size={15} />
          {statusText}
        </span>
      </div>

      <div className="settings-layout">
        <GlassPanel className="settings-sources">
          <PanelHeader icon={Database} title="Local source map" aside={`${summary.ready}/${summary.total} ready`} />
          <div className="source-list">
            {[...requiredSources, ...optionalSources].map((source) => (
              <div className={`source-row settings-source-row ${source.tone ?? "warm"}`} key={source.id}>
                <span className={`source-state ${source.status ?? source.state}`}>
                  <StatusIcon state={source.status ?? source.state} />
                </span>
                <div className="source-main">
                  <div className="source-title-line">
                    <strong>{source.module}</strong>
                    <small>{source.label}</small>
                  </div>
                  <code className="source-path">{source.path || "Not configured"}</code>
                  <div className="source-meta">
                    <span>{source.type}</span>
                    <span>{source.message ?? source.detail}</span>
                    <span>{source.status ?? source.state}</span>
                  </div>
                </div>
                <button
                  className="source-choose-button"
                  disabled={busySourceId === source.id}
                  onClick={() => chooseSourcePath(source)}
                  type="button"
                >
                  {busySourceId === source.id ? "Choosing" : "Choose"}
                </button>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="settings-summary-panel">
          <PanelHeader icon={SettingsIcon} title="Source health" aside="read only" />
          <div className="settings-summary-grid">
            <div>
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div>
              <span>Ready</span>
              <strong>{summary.ready}</strong>
            </div>
            <div>
              <span>Missing</span>
              <strong>{summary.missing}</strong>
            </div>
            <div>
              <span>Unconfigured</span>
              <strong>{summary.unconfigured}</strong>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="settings-detail-panel">
          <PanelHeader icon={FolderCog} title="Provider status" aside="masked only" />
          <div className="settings-boundary-list">
            {llmProviders.map((provider) => (
              <span key={provider.id}>
                Provider status: {provider.label} / {provider.status} / {provider.secretHint}
              </span>
            ))}
            {llmModels.map((model) => (
              <span key={model.id}>
                Model status: {model.label} / {model.status}
              </span>
            ))}
            {secrets.map((secret) => (
              <span key={secret.id}>
                Secret status - {secret.label}: {secret.masked}
              </span>
            ))}
            <span>Renderer reads through preload API only</span>
            <span>No shell command or local-intel service is started here</span>
          </div>
        </GlassPanel>
      </div>
    </>
  );
}

export function SettingsPanel({ onClose }) {
  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <button className="settings-scrim" onClick={onClose} type="button" aria-label="Dismiss settings overlay" />
      <section className="settings-drawer">
        <header className="settings-drawer-header">
          <div>
            <span className="eyebrow">Local Sources</span>
            <h2>Settings</h2>
          </div>
          <button className="icon-button ghost" onClick={onClose} type="button" aria-label="Close settings">
            <X size={17} />
          </button>
        </header>
        <SettingsContent />
      </section>
    </div>
  );
}

export function Settings() {
  return <SettingsPanel onClose={() => {}} />;
}
