import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("window control styles", () => {
  it("marks the custom titlebar as draggable while keeping controls clickable", async () => {
    const css = await fs.readFile("src/styles.css", "utf8");

    expect(css).toMatch(/\.titlebar\s*\{[^}]*-webkit-app-region:\s*drag/s);
    expect(css).toMatch(/\.window-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
    expect(css).toMatch(/\.window-actions button\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  });

  it("lets the desktop shell fill the viewport without a decorative outer frame", async () => {
    const css = await fs.readFile("src/styles.css", "utf8");

    expect(css).toMatch(/\.desktop-stage\s*\{[^}]*place-items:\s*stretch/s);
    expect(css).toMatch(/\.desktop-stage\s*\{[^}]*padding:\s*0/s);
    expect(css).toMatch(/\.app-window\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.app-window\s*\{[^}]*height:\s*100dvh/s);
    expect(css).toMatch(/\.app-window\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.app-window\s*\{[^}]*border-radius:\s*0/s);
    expect(css).toMatch(/\.app-window\s*\{[^}]*box-shadow:\s*none/s);
  });
});
