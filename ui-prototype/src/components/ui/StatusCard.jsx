import React from "react";

export function StatusCard({ name, value, tone }) {
  return (
    <div className={`status-card ${tone}`}>
      <span>{name}</span>
      <strong>{value}</strong>
      <i />
    </div>
  );
}
