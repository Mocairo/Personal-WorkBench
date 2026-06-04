import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalMusicData } from "./localMusicAdapter";

async function createMusicFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-music-"));
  await fs.mkdir(path.join(rootDir, "Focus Artist"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "Second Artist"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "Focus Artist", "Night Workspace.flac"), "");
  await fs.writeFile(path.join(rootDir, "Focus Artist", "Soft Compile.mp3"), "");
  await fs.writeFile(path.join(rootDir, "Second Artist", "Indexing Rain.wav"), "");
  await fs.writeFile(path.join(rootDir, "cover.jpg"), "");

  return rootDir;
}

describe("local music adapter", () => {
  it("builds Local Music data from a local music directory", async () => {
    const rootDir = await createMusicFixture();

    const data = await getLocalMusicData({ rootDir });

    expect(data.tracks).toEqual([
      { title: "Night Workspace", artist: "Focus Artist", length: "--:--" },
      { title: "Soft Compile", artist: "Focus Artist", length: "--:--" },
      { title: "Indexing Rain", artist: "Second Artist", length: "--:--" },
    ]);
    expect(data.audioMetadata).toEqual([
      { label: "Tracks", value: "3" },
      { label: "Formats", value: "FLAC, MP3, WAV" },
      { label: "Folder", value: path.basename(rootDir) },
      { label: "Library", value: "ready" },
    ]);
  });

  it("returns safe empty data when the music directory is missing", async () => {
    const data = await getLocalMusicData({
      rootDir: path.join(os.tmpdir(), "missing-local-music"),
    });

    expect(data).toEqual({
      audioMetadata: [
        { label: "Tracks", value: "0" },
        { label: "Formats", value: "none" },
        { label: "Folder", value: "missing" },
        { label: "Library", value: "missing" },
      ],
      tracks: [],
    });
  });
});
