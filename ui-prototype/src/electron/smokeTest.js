export function isDesktopApiSmokeTestEnabled(env = process.env) {
  return env.ELECTRON_SMOKE_TEST === "1" || env.ELECTRON_SMOKE_TEST === "true";
}

export function createDesktopApiSmokeScript() {
  return `
    Promise.all([
      window.desktopApi.agentManagement.getAgentManagement(),
      window.desktopApi.agentChat.getAgentChat(),
      window.desktopApi.agentChat.runDryMessage({ userText: "Summarize workspace dry-run" }),
      window.desktopApi.settings.getSettings(),
      window.desktopApi.llm.getProviderStatus()
    ]).then(([agentManagement, agentChat, dryRun, settings, llmProvider]) => ({
      agentCount: agentManagement.agents.length,
      agentNames: agentManagement.agents.map((agent) => agent.name),
      permissionMetrics: agentManagement.permissionMetrics,
      chatMessages: agentChat.chatMessages.length,
      contextItems: agentChat.contextItems,
      dryRunStatus: dryRun.status,
      dryRunTools: dryRun.toolPlan.items.length,
      llmProviderStatus: llmProvider.status,
      toolCalls: agentChat.toolCalls.map((tool) => tool.title),
      settingsSources: settings.sources.length,
      settingsReady: settings.summary.ready
    }))
  `;
}

export function attachDesktopApiSmokeTest(mainWindow, { app, logger = console } = {}) {
  mainWindow.webContents.once("did-finish-load", async () => {
    try {
      const result = await mainWindow.webContents.executeJavaScript(createDesktopApiSmokeScript());
      logger.log(`[electron-smoke] ${JSON.stringify(result)}`);
      app.quit();
    } catch (error) {
      logger.error("[electron-smoke] failed", error);
      app.exit(1);
    }
  });
}
