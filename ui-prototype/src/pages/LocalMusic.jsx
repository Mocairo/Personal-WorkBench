import React from "react";
import { ArrowLeft, ArrowRight, FileText, Headphones, Music2, Pause, Play, Search } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { PageFrame } from "../components/ui/PageFrame";
import { PanelHeader } from "../components/ui/PanelHeader";
import { useLocalMusicData } from "../hooks/usePageData";

const spectrumBars = ["42%", "68%", "36%", "78%", "55%", "88%", "47%", "64%", "39%", "72%", "51%", "83%"];
const extraMetadata = [
  { label: "Bitrate", value: "1,024 kbps" },
  { label: "Mode", value: "exclusive" },
];

export function mergeAudioMetadata(audioMetadata = [], fallbackMetadata = extraMetadata) {
  const labels = new Set(audioMetadata.map((item) => item.label?.toLowerCase()).filter(Boolean));
  const missingFallbacks = fallbackMetadata.filter((item) => !labels.has(item.label.toLowerCase()));

  return [...audioMetadata, ...missingFallbacks];
}

export function LocalMusic() {
  const { data } = useLocalMusicData();
  const { audioMetadata, providerStatus = { message: "Using mock data", status: "mock" }, sourceHealth = {}, tracks } = data;
  const metadataRows = mergeAudioMetadata(audioMetadata ?? [], [
    { label: "Source", value: providerStatus.status },
    { label: "Folder", value: sourceHealth.path || providerStatus.message },
    ...extraMetadata,
  ]);

  return (
    <PageFrame
      eyebrow="Local Library"
      title="Local Music"
      subtitle="Local audio corner"
      actions={
        <>
          <button className="soft-button" type="button">
            <Search size={15} />
            Library
          </button>
          <button className="soft-button muted" type="button">
            <Headphones size={15} />
            Output
          </button>
        </>
      }
    >
      <div className="music-layout">
        <GlassPanel className="player-panel">
          {tracks.length === 0 ? (
            <EmptyState title="No tracks found" detail="Choose a music folder in Settings." />
          ) : (
            <>
              <div className="album-art">
                <Music2 size={54} />
              </div>
              <div className="track-copy">
                <span>Now Playing</span>
                <h2>{tracks[0].title}</h2>
                <p>{tracks[0].artist}</p>
              </div>
              <div className="spectrum-strip" aria-hidden="true">
                {spectrumBars.map((height, index) => (
                  <i key={`${height}-${index}`} style={{ "--value": height }} />
                ))}
              </div>
              <div className="player-controls">
                <button type="button">
                  <ArrowLeft size={17} />
                </button>
                <button className="play-button" type="button">
                  <Pause size={20} />
                </button>
                <button type="button">
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="progress-line">
                <span />
              </div>
            </>
          )}
        </GlassPanel>

        <GlassPanel className="playlist-panel">
          <PanelHeader icon={Play} title="Play queue" aside={`${tracks.length} tracks`} />
          {tracks.length === 0 ? (
            <EmptyState title="Playlist is empty" detail="Supported audio files will appear here after scan." />
          ) : (
            tracks.map((track, index) => (
              <div className={`track-row ${index === 0 ? "selected" : ""}`} key={track.title}>
                <Play size={14} />
                <div>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </div>
                <time>{track.length}</time>
              </div>
            ))
          )}
        </GlassPanel>

        <GlassPanel className="metadata-panel">
          <PanelHeader icon={FileText} title="Audio metadata" aside="local file" />
          <div className="metadata-list">
            {metadataRows.map((item) => (
              <span key={item.label}>
                {item.label} <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        </GlassPanel>
      </div>
    </PageFrame>
  );
}
