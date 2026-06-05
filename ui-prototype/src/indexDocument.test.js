import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("index document", () => {
  it("uses an inline favicon to avoid a browser favicon 404 during local smoke checks", async () => {
    const html = await fs.readFile("index.html", "utf8");

    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml");
  });

  it("sets a Content Security Policy for the Electron renderer", async () => {
    const html = await fs.readFile("index.html", "utf8");

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
    expect(html).not.toContain("'unsafe-eval'");
  });
});
