import { describe, expect, it } from "vitest";
import { QuickEntry } from "./QuickEntry";

describe("QuickEntry", () => {
  it("notifies the navigation layer when clicked", () => {
    const selected = [];
    const element = QuickEntry({
      onSelect: (pageId) => selected.push(pageId),
      page: {
        id: "chat",
        label: "Chat",
      },
    });

    expect(element.props.type).toBe("button");
    element.props.onClick();
    expect(selected).toEqual(["chat"]);
  });
});
