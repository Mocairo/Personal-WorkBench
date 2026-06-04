import { describe, expect, it, vi } from "vitest";
import { attachDesktopApiSmokeTest, isDesktopApiSmokeTestEnabled } from "./smokeTest";

describe("electron smoke test helper", () => {
  it("runs desktopApi checks after the window finishes loading", async () => {
    const callbacks = new Map();
    const result = {
      agentCount: 4,
      chatMessages: 4,
      dryRunStatus: "permission_required",
      dryRunTools: 3,
      llmProviderStatus: "unconfigured",
      settingsSources: 7,
    };
    const mainWindow = {
      webContents: {
        executeJavaScript: vi.fn().mockResolvedValue(result),
        once: vi.fn((eventName, callback) => callbacks.set(eventName, callback)),
      },
    };
    const app = { exit: vi.fn(), quit: vi.fn() };
    const logger = { error: vi.fn(), log: vi.fn() };

    attachDesktopApiSmokeTest(mainWindow, { app, logger });
    await callbacks.get("did-finish-load")();

    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.desktopApi.agentManagement.getAgentManagement"),
    );
    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.desktopApi.agentChat.getAgentChat"),
    );
    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.desktopApi.agentChat.runDryMessage"),
    );
    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.desktopApi.settings.getSettings"),
    );
    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("window.desktopApi.llm.getProviderStatus"),
    );
    expect(logger.log).toHaveBeenCalledWith(`[electron-smoke] ${JSON.stringify(result)}`);
    expect(app.quit).toHaveBeenCalled();
    expect(app.exit).not.toHaveBeenCalled();
  });

  it("exits non-zero when the desktopApi check fails", async () => {
    const callbacks = new Map();
    const error = new Error("desktopApi missing");
    const mainWindow = {
      webContents: {
        executeJavaScript: vi.fn().mockRejectedValue(error),
        once: vi.fn((eventName, callback) => callbacks.set(eventName, callback)),
      },
    };
    const app = { exit: vi.fn(), quit: vi.fn() };
    const logger = { error: vi.fn(), log: vi.fn() };

    attachDesktopApiSmokeTest(mainWindow, { app, logger });
    await callbacks.get("did-finish-load")();

    expect(logger.error).toHaveBeenCalledWith("[electron-smoke] failed", error);
    expect(app.exit).toHaveBeenCalledWith(1);
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("is enabled only when ELECTRON_SMOKE_TEST is set", () => {
    expect(isDesktopApiSmokeTestEnabled({ ELECTRON_SMOKE_TEST: "1" })).toBe(true);
    expect(isDesktopApiSmokeTestEnabled({ ELECTRON_SMOKE_TEST: "true" })).toBe(true);
    expect(isDesktopApiSmokeTestEnabled({})).toBe(false);
  });
});
