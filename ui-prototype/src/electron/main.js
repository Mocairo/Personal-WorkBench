import { existsSync } from "node:fs";
import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { getElectronPaths, resolveRendererTarget } from "./mainConfig.js";
import { registerIpcHandlers, registerWindowControlHandlers } from "./ipcHandlers.js";
import { createMainDataProvider } from "./mainProvider.js";
import { attachDesktopApiSmokeTest, isDesktopApiSmokeTestEnabled } from "./smokeTest.js";

const DEFAULT_LOCAL_BGE_MODEL_PATH = "D:\\models\\bge-m3";
const DEFAULT_LOCAL_BGE_PYTHON_PATH = "D:\\Miniconda\\envs\\bge-m3-embed\\python.exe";
const DEFAULT_LOCAL_BGE_BATCH_SIZE = 64;
const DEFAULT_LOCAL_BGE_TIMEOUT_MS = 600_000;
const RENDERER_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'self'";

function registerRendererSecurityHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [RENDERER_CSP],
      },
    });
  });
}

function getLocalBgePythonPath(env = process.env) {
  const configuredPath = typeof env.LOCAL_BGE_PYTHON_PATH === "string" ? env.LOCAL_BGE_PYTHON_PATH.trim() : "";
  if (configuredPath) {
    return configuredPath;
  }

  return existsSync(DEFAULT_LOCAL_BGE_PYTHON_PATH) ? DEFAULT_LOCAL_BGE_PYTHON_PATH : "python";
}

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
  registerRendererSecurityHeaders();
  registerIpcHandlers(
    ipcMain,
    createMainDataProvider({
      dialog,
      embeddingConfig: {
        model: "bge-m3",
        modelPath: DEFAULT_LOCAL_BGE_MODEL_PATH,
        provider: "local-bge-m3",
      },
      embeddingMaxBatchSize: DEFAULT_LOCAL_BGE_BATCH_SIZE,
      embeddingPythonPath: getLocalBgePythonPath(),
      embeddingTimeoutMs: DEFAULT_LOCAL_BGE_TIMEOUT_MS,
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
