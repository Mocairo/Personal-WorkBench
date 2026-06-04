import * as localProvider from "./localProvider";
import * as mockProvider from "./mockProvider";

function getDefaultProviderMode() {
  return import.meta.env?.VITE_DATA_PROVIDER ?? "auto";
}

function hasDesktopApi() {
  return Boolean(globalThis.window?.api ?? globalThis.window?.desktopApi);
}

export function resolveDataProvider(mode = getDefaultProviderMode()) {
  return mode === "local" || (mode === "auto" && hasDesktopApi()) ? localProvider : mockProvider;
}

export const dataProvider = resolveDataProvider();
