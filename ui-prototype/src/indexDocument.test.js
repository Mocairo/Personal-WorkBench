import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("index document", () => {
  it("uses an inline favicon to avoid a browser favicon 404 during local smoke checks", async () => {
    const html = await fs.readFile("index.html", "utf8");

    expect(html).toContain('rel="icon"');
    expect(html).toContain("data:image/svg+xml");
  });
});
