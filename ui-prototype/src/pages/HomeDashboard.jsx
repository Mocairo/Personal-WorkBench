import React from "react";
import { Activity, BrainCircuit, Check, Clock3, Gauge, ListChecks, RefreshCcw, Zap } from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { QuickEntry } from "../components/ui/QuickEntry";
import { StatusCard } from "../components/ui/StatusCard";
import { useHomeDashboardData } from "../hooks/useHomeDashboardData";

const focusMetrics = [
  { label: "Active context", value: "4 modules" },
  { label: "Background work", value: "7 jobs" },
  { label: "Local only", value: "safe" },
];

const backgroundJobs = [
  { label: "Knowledge index", value: "82%" },
  { label: "Repo scan", value: "2 changes" },
  { label: "Intel digest", value: "12 new" },
];

export function HomeDashboard() {
  const { data } = useHomeDashboardData();
  const { homeTasks, quickEntries, recentActivities, serviceState } = data;

  return (
    <PageFrame
      eyebrow="Today"
      title="Home Dashboard"
      subtitle="Personal local command center"
      actions={
        <>
          <button className="soft-button" type="button">
            <Clock3 size={15} />
            Task Center
          </button>
          <button className="soft-button muted" type="button">
            <RefreshCcw size={15} />
            Sync Now
          </button>
        </>
      }
    >
      <div className="home-grid">
        <GlassPanel className="hero-panel">
          <div className="hero-copy">
            <span className="soft-chip">Active workspace</span>
            <h2>Local console is shaping today's working context</h2>
            <p>Knowledge, code, agents and intel stay connected while the current page keeps focus.</p>
            <div className="home-live-row">
              {focusMetrics.map((item) => (
                <span key={item.label}>
                  {item.label}
                  <strong>{item.value}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit-core">
              <BrainCircuit size={38} />
            </span>
            <i className="orbit-node one" />
            <i className="orbit-node two" />
            <i className="orbit-node three" />
          </div>
        </GlassPanel>

        <GlassPanel className="tasks-panel">
          <PanelHeader icon={ListChecks} title="Today queue" aside={`${homeTasks.length} open`} />
          <div className="task-list">
            {homeTasks.map((task, index) => (
              <div className={`task-row ${index === 0 ? "selected" : ""}`} key={task.title}>
                <span className="check-dot">
                  <Check size={13} />
                </span>
                <div>
                  <strong>{task.title}</strong>
                  <small>{task.module}</small>
                </div>
                <time>{task.time}</time>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="status-panel">
          <PanelHeader icon={Gauge} title="Sync state" aside="local" />
          <div className="status-grid">
            {serviceState.map((item) => (
              <StatusCard key={item.name} {...item} />
            ))}
          </div>
          <div className="background-job-list">
            {backgroundJobs.map((job) => (
              <span key={job.label}>
                {job.label}
                <strong>{job.value}</strong>
              </span>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="activity-panel">
          <PanelHeader icon={Activity} title="Activity stream" aside="last 20 min" />
          <div className="timeline-list">
            {recentActivities.map((item, index) => (
              <div className="timeline-row linked" key={item}>
                <i />
                <span>{item}</span>
                <small>{index + 2}m ago</small>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="quick-panel">
          <PanelHeader icon={Zap} title="Jump points" />
          <div className="quick-grid">
            {quickEntries.map((page) => (
              <QuickEntry page={page} key={page.id} />
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
