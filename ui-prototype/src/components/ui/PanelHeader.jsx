import React from "react";

export function PanelHeader({ icon: Icon, title, aside }) {
  return (
    <div className="panel-header">
      <h2>
        {Icon && <Icon size={17} />}
        {title}
      </h2>
      {aside && <span>{aside}</span>}
    </div>
  );
}
