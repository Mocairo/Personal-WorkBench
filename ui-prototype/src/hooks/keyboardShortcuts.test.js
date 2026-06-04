import { describe, expect, it } from "vitest";
import { getGlobalKeyboardAction } from "./keyboardShortcuts";

describe("global keyboard shortcuts", () => {
  it("uses Alt+Q for the page switcher and no longer reserves Alt+Space", () => {
    expect(getGlobalKeyboardAction({ altKey: true, code: "KeyQ", key: "q" })).toBe("open-switcher");
    expect(getGlobalKeyboardAction({ altKey: true, code: "Space", key: " " })).toBeNull();
  });

  it("uses Escape as the Settings shortcut", () => {
    expect(getGlobalKeyboardAction({ key: "Escape" })).toBe("toggle-settings");
  });
});
