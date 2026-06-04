import React from "react";
import { Command, Settings } from "lucide-react";
import { pageIcons } from "../pageIcons";

export function FloatingControlBar({ activePage, onOpenSettings, onOpenSwitcher }) {
  const ActiveIcon = pageIcons[activePage.id];
  const syncSnapshot = {
    lastUpdated: "2m ago",
    stale: false,
    syncing: true,
  };
  const syncState = [
    {
      label: syncSnapshot.syncing ? "Indexing local sources" : `Synced ${syncSnapshot.lastUpdated}`,
      tone: syncSnapshot.syncing ? "warm" : "good",
    },
    {
      label: syncSnapshot.stale ? "Local source changed" : `Synced ${syncSnapshot.lastUpdated}`,
      tone: syncSnapshot.stale ? "cool" : "good",
    },
    { label: "Mock data bridge", tone: "cool" },
  ];

  return (
    <nav className="floating-control" aria-label="Global shell controls">
      <button className="switch-trigger" onClick={onOpenSwitcher}>
        <span className="switch-icon">
          <ActiveIcon size={16} />
        </span>
        <span>{activePage.name}</span>
        <kbd>Alt Q</kbd>
      </button>
      <div className="service-pills">
        {syncState.map((item) => (
          <span className={`service-pill ${item.tone}`} key={item.label}>
            <i />
            {item.label}
          </span>
        ))}
      </div>
      <button className="icon-button" aria-label="Command palette">
        <Command size={16} />
      </button>
      <button className="icon-button" aria-label="Settings" onClick={onOpenSettings}>
        <Settings size={16} />
      </button>
    </nav>
  );
}
