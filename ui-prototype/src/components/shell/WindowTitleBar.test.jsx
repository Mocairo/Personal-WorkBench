import React from "react";
import { describe, expect, it } from "vitest";
import { pages } from "../../data/pageRegistry";
import { WindowTitleBar } from "./WindowTitleBar";

describe("WindowTitleBar", () => {
  it("connects the titlebar buttons to Electron window controls", () => {
    const calls = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      api: {
        window: {
          close: () => calls.push("close"),
          maximize: () => calls.push("maximize"),
          minimize: () => calls.push("minimize"),
        },
      },
    };

    try {
      const titlebar = WindowTitleBar({ activePage: pages[0] });
      const [, actions] = React.Children.toArray(titlebar.props.children);
      const buttons = React.Children.toArray(actions.props.children);

      buttons[0].props.onClick();
      buttons[1].props.onClick();
      buttons[2].props.onClick();

      expect(calls).toEqual(["minimize", "maximize", "close"]);
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
