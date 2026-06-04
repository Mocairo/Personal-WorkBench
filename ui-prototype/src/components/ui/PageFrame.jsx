import React from "react";

export function PageFrame({ eyebrow, title, subtitle, children, actions, showSubtitle = false }) {
  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {showSubtitle && subtitle && <p>{subtitle}</p>}
        </div>
        <div className="page-actions">{actions}</div>
      </div>
      {children}
    </section>
  );
}
