import path from "node:path";
import { fileURLToPath } from "node:url";

export function getElectronPaths(metaUrl = import.meta.url) {
  const electronDir = path.dirname(fileURLToPath(metaUrl));

  return {
    preloadPath: path.join(electronDir, "preload.js"),
    distIndexPath: path.resolve(electronDir, "../../dist/index.html"),
  };
}

export function resolveRendererTarget(env = process.env, paths = getElectronPaths()) {
  if (env.ELECTRON_RENDERER_URL) {
    return {
      type: "url",
      value: env.ELECTRON_RENDERER_URL,
    };
  }

  return {
    type: "file",
    value: paths.distIndexPath,
  };
}
