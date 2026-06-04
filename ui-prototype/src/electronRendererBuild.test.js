import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config.js";

describe("electron renderer build config", () => {
  it("uses relative asset URLs so dist/index.html works under Electron file loading", () => {
    expect(viteConfig).toMatchObject({
      base: "./",
    });
  });
});
