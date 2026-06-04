import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders a compact empty state for work panels", () => {
    const markup = renderToStaticMarkup(
      <EmptyState title="No local data" detail="Choose a source in Settings." />,
    );

    expect(markup).toContain("No local data");
    expect(markup).toContain("Choose a source in Settings.");
    expect(markup).toContain("empty-state");
  });
});
