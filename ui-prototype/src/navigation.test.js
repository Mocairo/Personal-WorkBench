import { describe, expect, it } from "vitest";
import { carouselDistance, nextPageIndex, pages, shortcutToIndex, wrapIndex } from "./navigation";

describe("page switcher navigation helpers", () => {
  it("keeps Settings outside the primary eight-page navigation system", () => {
    expect(pages.map((page) => page.id)).toEqual([
      "home",
      "chat",
      "knowledge",
      "agents",
      "code",
      "music",
      "intel",
      "widgets",
    ]);
  });

  it("wraps carousel indexes in both directions", () => {
    expect(wrapIndex(-1, pages.length)).toBe(pages.length - 1);
    expect(wrapIndex(pages.length, pages.length)).toBe(0);
  });

  it("moves to the next or previous page with wrapping", () => {
    expect(nextPageIndex(0, -1)).toBe(pages.length - 1);
    expect(nextPageIndex(pages.length - 1, 1)).toBe(0);
  });

  it("returns the shortest signed distance for carousel cards", () => {
    expect(carouselDistance(0, 0, pages.length)).toBe(0);
    expect(carouselDistance(1, 0, pages.length)).toBe(1);
    expect(carouselDistance(pages.length - 1, 0, pages.length)).toBe(-1);
    expect(carouselDistance(0, pages.length - 1, pages.length)).toBe(1);
  });

  it("maps Alt+1..8 to page indexes only", () => {
    expect(shortcutToIndex({ altKey: true, key: "1" })).toBe(0);
    expect(shortcutToIndex({ altKey: true, key: "8" })).toBe(7);
    expect(shortcutToIndex({ altKey: true, key: "9" })).toBeNull();
    expect(shortcutToIndex({ altKey: false, key: "3" })).toBeNull();
    expect(shortcutToIndex({ altKey: true, key: "0" })).toBeNull();
  });
});
