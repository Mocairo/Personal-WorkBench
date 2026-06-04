import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageFrame } from "./PageFrame";

describe("PageFrame", () => {
  it("keeps page headings compact by hiding subtitles unless explicitly requested", () => {
    const compactMarkup = renderToStaticMarkup(
      <PageFrame eyebrow="Runtime" title="Agent Chat" subtitle="Unnecessary explanatory text">
        <div>workspace</div>
      </PageFrame>,
    );

    expect(compactMarkup).toContain("Agent Chat");
    expect(compactMarkup).not.toContain("Unnecessary explanatory text");

    const expandedMarkup = renderToStaticMarkup(
      <PageFrame eyebrow="Runtime" title="Agent Chat" subtitle="Useful explanatory text" showSubtitle>
        <div>workspace</div>
      </PageFrame>,
    );

    expect(expandedMarkup).toContain("Useful explanatory text");
  });
});
