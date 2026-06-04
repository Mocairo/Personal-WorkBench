import { contextBridge, ipcRenderer } from "electron";
import { createDesktopApi } from "./desktopApiFactory.js";

contextBridge.exposeInMainWorld("api", createDesktopApi(ipcRenderer));
contextBridge.exposeInMainWorld("desktopApi", createDesktopApi(ipcRenderer, { unwrapResults: true }));
