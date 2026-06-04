import React from "react";

export function GlassPanel({ className = "", children }) {
  return <section className={`glass-panel ${className}`}>{children}</section>;
}
