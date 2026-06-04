import React from "react";

export function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
