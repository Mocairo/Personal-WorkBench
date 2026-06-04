import React from "react";
import { pageIcons } from "../pageIcons";

export function QuickEntry({ page }) {
  const Icon = pageIcons[page.id];

  return (
    <button className="quick-entry">
      <Icon size={18} />
      <span>{page.label}</span>
    </button>
  );
}
