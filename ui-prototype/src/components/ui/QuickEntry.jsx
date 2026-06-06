import React from "react";
import { pageIcons } from "../pageIcons";

export function QuickEntry({ onSelect, page }) {
  const Icon = pageIcons[page.id];
  const enabled = typeof onSelect === "function";

  return (
    <button
      aria-label={`Open ${page.label}`}
      className="quick-entry"
      disabled={!enabled}
      onClick={() => onSelect?.(page.id)}
      type="button"
    >
      <Icon size={18} />
      <span>{page.label}</span>
    </button>
  );
}
