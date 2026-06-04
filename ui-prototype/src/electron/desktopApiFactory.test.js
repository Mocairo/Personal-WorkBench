import { describe, expect, it } from "vitest";
import { createDesktopApi } from "./desktopApiFactory";

describe("desktop API factory", () => {
  it("creates the window.api shape from the documented namespaces", async () => {
    const calls = [];
    const api = createDesktopApi({
      invoke(channel, ...args) {
        calls.push({ args, channel });
        return Promise.resolve({ data: args.length > 0 ? { args, channel } : { channel }, ok: true });
      },
    });

    await expect(api.system.getAppStatus()).resolves.toEqual({
      data: { channel: "system:app:status" },
      ok: true,
    });
    await expect(api.kb.listSources()).resolves.toEqual({
      data: { channel: "kb:source:list" },
      ok: true,
    });
    await expect(api.codeRepo.getGitSummary("local-root")).resolves.toEqual({
      data: { args: ["local-root"], channel: "codeRepo:git:summary" },
      ok: true,
    });
    await expect(api.agent.listAgents()).resolves.toEqual({
      data: { channel: "agent:agent:list" },
      ok: true,
    });
    await expect(api.intel.getServiceStatus()).resolves.toEqual({
      data: { channel: "intel:service:status" },
      ok: true,
    });
    await expect(api.intel.listLogs()).resolves.toEqual({
      data: { channel: "intel:log:list" },
      ok: true,
    });
    await expect(api.music.getPlaybackState()).resolves.toEqual({
      data: { channel: "music:playback:state" },
      ok: true,
    });
    await expect(api.voice.getVoiceStatus()).resolves.toEqual({
      data: { channel: "voice:status:get" },
      ok: true,
    });
    await expect(api.llm.listProviders()).resolves.toEqual({
      data: { channel: "llm:provider:list" },
      ok: true,
    });
    await expect(api.llm.validateProviderConfig({ provider: "openai" })).resolves.toEqual({
      data: { args: [{ provider: "openai" }], channel: "llm:provider:validate" },
      ok: true,
    });
    await expect(api.llm.sendTextMessage({ userText: "Hello" })).resolves.toEqual({
      data: { args: [{ userText: "Hello" }], channel: "llm:message:sendText" },
      ok: true,
    });
    await expect(api.permission.evaluateToolRequest({ toolId: "kb.search" })).resolves.toEqual({
      data: { args: [{ toolId: "kb.search" }], channel: "permission:tool:evaluate" },
      ok: true,
    });
    await expect(api.tool.dryRun({ toolId: "kb.search" })).resolves.toEqual({
      data: { args: [{ toolId: "kb.search" }], channel: "tool:dryRun" },
      ok: true,
    });
    await expect(api.dashboard.getHomeDashboard()).resolves.toEqual({
      data: { channel: "dashboard:getHomeDashboard" },
      ok: true,
    });
    await expect(api.agentChat.runDryMessage({ userText: "dry run" })).resolves.toEqual({
      data: { args: [{ userText: "dry run" }], channel: "agentChat:message:runDry" },
      ok: true,
    });
    await expect(api.agentChat.sendMessage({ userText: "Hello" })).resolves.toEqual({
      data: { args: [{ userText: "Hello" }], channel: "agentChat:message:send" },
      ok: true,
    });

    expect(calls).toEqual([
      { args: [], channel: "system:app:status" },
      { args: [], channel: "kb:source:list" },
      { args: ["local-root"], channel: "codeRepo:git:summary" },
      { args: [], channel: "agent:agent:list" },
      { args: [], channel: "intel:service:status" },
      { args: [], channel: "intel:log:list" },
      { args: [], channel: "music:playback:state" },
      { args: [], channel: "voice:status:get" },
      { args: [], channel: "llm:provider:list" },
      { args: [{ provider: "openai" }], channel: "llm:provider:validate" },
      { args: [{ userText: "Hello" }], channel: "llm:message:sendText" },
      { args: [{ toolId: "kb.search" }], channel: "permission:tool:evaluate" },
      { args: [{ toolId: "kb.search" }], channel: "tool:dryRun" },
      { args: [], channel: "dashboard:getHomeDashboard" },
      { args: [{ userText: "dry run" }], channel: "agentChat:message:runDry" },
      { args: [{ userText: "Hello" }], channel: "agentChat:message:send" },
    ]);
  });

  it("can create a compatibility desktopApi that unwraps ApiResult payloads", async () => {
    const calls = [];
    const api = createDesktopApi(
      {
        invoke(channel, ...args) {
          calls.push({ args, channel });
          return Promise.resolve({ data: args.length > 0 ? { args, channel } : { channel }, ok: true });
        },
      },
      { unwrapResults: true },
    );

    await expect(api.dashboard.getHomeDashboard()).resolves.toEqual({
      channel: "dashboard:getHomeDashboard",
    });
    await expect(api.agentChat.getAgentChat()).resolves.toEqual({
      channel: "agentChat:getAgentChat",
    });
    await expect(api.knowledge.getKnowledgeBase()).resolves.toEqual({
      channel: "knowledge:getKnowledgeBase",
    });
    await expect(api.agentManagement.getAgentManagement()).resolves.toEqual({
      channel: "agentManagement:getAgentManagement",
    });
    await expect(api.repository.getCodeRepository()).resolves.toEqual({
      channel: "repository:getCodeRepository",
    });
    await expect(api.music.getLocalMusic()).resolves.toEqual({
      channel: "music:getLocalMusic",
    });
    await expect(api.intel.getIntelCenter()).resolves.toEqual({
      channel: "intel:getIntelCenter",
    });
    await expect(api.settings.getSettings()).resolves.toEqual({
      channel: "settings:getSettings",
    });
    await expect(api.settings.selectLocalSourcePath("local-music")).resolves.toEqual({
      args: ["local-music"],
      channel: "settings:selectLocalSourcePath",
    });
    await expect(api.settings.saveLocalSourcePath("local-music", "D:\\Music")).resolves.toEqual({
      args: ["local-music", "D:\\Music"],
      channel: "settings:saveLocalSourcePath",
    });
    await expect(api.widgets.getWidgets()).resolves.toEqual({
      channel: "widgets:getWidgets",
    });

    expect(calls).toEqual([
      { args: [], channel: "dashboard:getHomeDashboard" },
      { args: [], channel: "agentChat:getAgentChat" },
      { args: [], channel: "knowledge:getKnowledgeBase" },
      { args: [], channel: "agentManagement:getAgentManagement" },
      { args: [], channel: "repository:getCodeRepository" },
      { args: [], channel: "music:getLocalMusic" },
      { args: [], channel: "intel:getIntelCenter" },
      { args: [], channel: "settings:getSettings" },
      { args: ["local-music"], channel: "settings:selectLocalSourcePath" },
      { args: ["local-music", "D:\\Music"], channel: "settings:saveLocalSourcePath" },
      { args: [], channel: "widgets:getWidgets" },
    ]);
  });

  it("exposes fire-and-forget window controls through the desktop API", () => {
    const calls = [];
    const api = createDesktopApi({
      invoke() {
        throw new Error("window controls should not use invoke");
      },
      send(channel) {
        calls.push(channel);
      },
    });

    api.window.minimize();
    api.window.maximize();
    api.window.close();

    expect(calls).toEqual(["window:minimize", "window:maximize", "window:close"]);
  });

  it("exposes filtered Agent Chat stream event subscriptions with cleanup", () => {
    const listeners = new Map();
    const removed = [];
    const api = createDesktopApi({
      invoke() {
        throw new Error("stream subscriptions should not invoke");
      },
      on(channel, listener) {
        listeners.set(channel, listener);
      },
      removeListener(channel, listener) {
        removed.push({ channel, listener });
      },
      send() {},
    });
    const received = [];

    const unsubscribe = api.agentChat.onStreamEvent("request-1", (event) => received.push(event));
    const listener = listeners.get("agentChat:message:stream:event");

    listener(null, {
      requestId: "request-2",
      token: "ignored",
      type: "token",
    });
    listener(null, {
      requestId: "request-1",
      text: "Hello",
      token: "Hello",
      type: "token",
    });
    unsubscribe();

    expect(received).toEqual([
      {
        requestId: "request-1",
        text: "Hello",
        token: "Hello",
        type: "token",
      },
    ]);
    expect(removed).toEqual([
      {
        channel: "agentChat:message:stream:event",
        listener,
      },
    ]);
  });
});
