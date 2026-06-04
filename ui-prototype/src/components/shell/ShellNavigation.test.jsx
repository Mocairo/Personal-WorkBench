import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pages } from "../../data/pageRegistry";
import { FloatingControlBar } from "./FloatingControlBar";
import { PageSwitcher } from "./PageSwitcher";
import { RadialWheel } from "./RadialWheel";

describe("shell navigation surfaces", () => {
  it("renders exactly the eight primary pages in the page switcher", () => {
    const markup = renderToStaticMarkup(
      <PageSwitcher
        activeIndex={0}
        selectedIndex={0}
        selectedPage={pages[0]}
        onSelect={() => {}}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );

    expect((markup.match(/class="switch-card(?:\s|")/g) ?? []).length).toBe(8);
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Alt+9");
  });

  it("renders exactly the eight primary pages in the radial wheel", () => {
    const markup = renderToStaticMarkup(
      <RadialWheel selectedIndex={0} onSelect={() => {}} onConfirm={() => {}} />,
    );

    expect((markup.match(/wheel-node/g) ?? []).length).toBe(8);
    expect(markup).not.toContain("Settings");
  });

  it("keeps Settings as a top-bar control rather than a page entry", () => {
    const markup = renderToStaticMarkup(
      <FloatingControlBar activePage={pages[0]} onOpenSwitcher={() => {}} onOpenSettings={() => {}} />,
    );

    expect(markup).toContain("aria-label=\"Settings\"");
    expect(markup).toContain("Synced");
    expect(markup).toContain("Alt Q");
    expect(markup).not.toContain("Alt Space");
  });
});
