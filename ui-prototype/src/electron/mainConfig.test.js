import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRendererTarget } from "./mainConfig";

describe("electron main config", () => {
  it("loads the Vite dev server when ELECTRON_RENDERER_URL is set", () => {
    expect(
      resolveRendererTarget(
        { ELECTRON_RENDERER_URL: "http://127.0.0.1:5173/" },
        { distIndexPath: "D:\\app\\dist\\index.html" },
      ),
    ).toEqual({
      type: "url",
      value: "http://127.0.0.1:5173/",
    });
  });

  it("loads the built dist index when no dev server URL is set", () => {
    const distIndexPath = path.normalize("D:\\app\\dist\\index.html");

    expect(resolveRendererTarget({}, { distIndexPath })).toEqual({
      type: "file",
      value: distIndexPath,
    });
  });
});
