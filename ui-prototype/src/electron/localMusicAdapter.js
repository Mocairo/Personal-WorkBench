import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AUDIO_EXTENSIONS = new Set([".aac", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".wav"]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

function artistFromPath(rootDir, filePath) {
  const relativePath = path.relative(rootDir, filePath);
  const segments = relativePath.split(path.sep);

  return segments.length > 1 ? segments[0] : "Local Library";
}

async function walkAudioFiles(rootDir) {
  const files = [];

  async function walk(dirPath) {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(extension)) {
        files.push({ extension, path: entryPath });
      }
    }
  }

  await walk(rootDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function buildAudioMetadata(rootDir, files, libraryState) {
  const formats = [...new Set(files.map((file) => file.extension.slice(1).toUpperCase()))].sort();

  return [
    { label: "Tracks", value: String(files.length) },
    { label: "Formats", value: formats.length > 0 ? formats.join(", ") : "none" },
    { label: "Folder", value: libraryState === "ready" ? path.basename(rootDir) : "missing" },
    { label: "Library", value: libraryState },
  ];
}

export async function getLocalMusicData(options = {}) {
  const rootDir = options.rootDir ?? process.env.LOCAL_MUSIC_ROOT ?? path.join(os.homedir(), "Music");
  const exists = await pathExists(rootDir);

  if (!exists) {
    return {
      audioMetadata: buildAudioMetadata(rootDir, [], "missing"),
      tracks: [],
    };
  }

  const files = await walkAudioFiles(rootDir);

  return {
    audioMetadata: buildAudioMetadata(rootDir, files, "ready"),
    tracks: files.slice(0, 12).map((file) => ({
      title: titleFromFilename(file.path),
      artist: artistFromPath(rootDir, file.path),
      length: "--:--",
    })),
  };
}
