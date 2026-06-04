import React from "react";

export function PageMiniature({ pageId }) {
  return (
    <span className={`miniature ${pageId}`}>
      <span className="mini-bar" />
      <span className="mini-row wide" />
      <span className="mini-row" />
      <span className="mini-row short" />
      <span className="mini-grid">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
