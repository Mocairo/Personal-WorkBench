import React from "react";
import { FileText, Gauge, Inbox, MoreHorizontal, Pause, Pin, Plus, Settings, Timer } from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useWidgetsData } from "../hooks/usePageData";

export function Widgets() {
  const { data } = useWidgetsData();
  const { clipboardItems, systemMetrics } = data;

  return (
    <PageFrame
      eyebrow="Utility Surface"
      title="小组件"
      subtitle="Pinned local widgets"
      actions={
        <>
          <button className="soft-button" type="button">
            <Plus size={15} />
            Add Widget
          </button>
          <button className="soft-button muted" type="button">
            <Settings size={15} />
            Arrange
          </button>
        </>
      }
    >
      <div className="widget-grid">
        <GlassPanel className="timer-widget widget-tile floating">
          <PanelHeader icon={Timer} title="Timer" aside="floating" />
          <div className="widget-status-line">
            <Pin size={13} />
            floating / recently used
          </div>
          <div className="timer-face">24:18</div>
          <button className="soft-button" type="button">
            <Pause size={15} />
            Pause
          </button>
        </GlassPanel>

        <GlassPanel className="note-widget widget-tile pinned tall">
          <PanelHeader icon={FileText} title="Sticky note" aside="pinned" />
          <div className="widget-status-line">
            <Pin size={13} />
            pinned to workspace
          </div>
          <p>Switching pages keeps the current page blurred behind the coverflow, while the selected card stays crisp.</p>
        </GlassPanel>

        <GlassPanel className="clipboard-widget widget-tile compact">
          <PanelHeader icon={Inbox} title="Clipboard" aside={`${clipboardItems.length} items`} />
          {clipboardItems.map((item) => (
            <div className="clip-row" key={item}>
              <span>{item}</span>
              <MoreHorizontal size={14} />
            </div>
          ))}
        </GlassPanel>

        <GlassPanel className="system-widget widget-tile mini">
          <PanelHeader icon={Gauge} title="System" aside="local" />
          <div className="system-bars">
            {systemMetrics.map((metric) => (
              <span key={metric.label}>
                {metric.label} <i style={{ "--value": metric.value }} />
              </span>
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
