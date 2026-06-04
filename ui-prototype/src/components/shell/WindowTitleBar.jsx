import React from "react";
import { Maximize2, Minimize2, Sparkles, X } from "lucide-react";

export function WindowTitleBar({ activePage }) {
  const windowControls = globalThis.window?.api?.window;

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <span className="app-mark">
          <Sparkles size={14} />
        </span>
        <span>Local Console</span>
        <span className="titlebar-separator" />
        <span className="muted-title">{activePage.name}</span>
      </div>
      <div className="window-actions" aria-label="Window controls">
        <button aria-label="Minimize" onClick={() => windowControls?.minimize()}>
          <Minimize2 size={13} />
        </button>
        <button aria-label="Maximize" onClick={() => windowControls?.maximize()}>
          <Maximize2 size={13} />
        </button>
        <button className="close-button" aria-label="Close" onClick={() => windowControls?.close()}>
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
