import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { getElectronPaths, resolveRendererTarget } from "./mainConfig.js";
import { registerIpcHandlers, registerWindowControlHandlers } from "./ipcHandlers.js";
import { createMainDataProvider } from "./mainProvider.js";
import { attachDesktopApiSmokeTest, isDesktopApiSmokeTestEnabled } from "./smokeTest.js";

function createMainWindow() {
  const paths = getElectronPaths();
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 390,
    minHeight: 720,
    backgroundColor: "#fbf8ff",
    frame: false,
    webPreferences: {
      preload: paths.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const target = resolveRendererTarget(process.env, paths);

  if (target.type === "url") {
    mainWindow.loadURL(target.value);
  } else {
    mainWindow.loadFile(target.value);
  }

  if (isDesktopApiSmokeTestEnabled(process.env)) {
    attachDesktopApiSmokeTest(mainWindow, { app });
  }

  return mainWindow;
}

app.whenReady().then(() => {
  registerIpcHandlers(
    ipcMain,
    createMainDataProvider({
      dialog,
      userDataDir: app.getPath("userData"),
    }),
  );
  registerWindowControlHandlers(ipcMain, BrowserWindow);

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
