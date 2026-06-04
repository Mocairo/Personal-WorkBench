import React from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { pages } from "../../data/pageRegistry";
import { carouselDistance, nextPageIndex } from "../../navigation";
import { pageIcons } from "../pageIcons";
import { PageMiniature } from "./PageMiniature";
import { RadialWheel } from "./RadialWheel";

export function PageSwitcher({
  activeIndex,
  selectedIndex,
  selectedPage,
  onSelect,
  onConfirm,
  onClose,
}) {
  return (
    <div
      className="switcher-overlay"
      onWheel={(event) => {
        event.preventDefault();
        onSelect((index) => nextPageIndex(index, event.deltaY > 0 ? 1 : -1));
      }}
    >
      <div className="switcher-scrim" />
      <div className="switcher-topline">
        <span>Page Switcher</span>
        <strong>{selectedPage.shortcut}</strong>
        <button className="icon-button ghost" onClick={onClose} aria-label="Close page switcher">
          <X size={16} />
        </button>
      </div>

      <button
        className="switch-arrow left"
        onClick={() => onSelect((index) => nextPageIndex(index, -1))}
        aria-label="Previous page"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="coverflow" aria-label="Registered pages">
        {pages.map((page, index) => {
          const distance = carouselDistance(index, selectedIndex);
          const abs = Math.abs(distance);
          const Icon = pageIcons[page.id];
          const isSelected = index === selectedIndex;
          const isActive = index === activeIndex;

          return (
            <button
              className={`switch-card ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
              key={page.id}
              style={{
                "--distance": distance,
                "--abs-distance": abs,
                "--accent": page.accent,
              }}
              onClick={() => (isSelected ? onConfirm(index) : onSelect(index))}
            >
              <span className="card-glow" />
              <span className="switch-card-header">
                <span className="switch-card-icon">
                  <Icon size={22} />
                </span>
                <kbd>{page.shortcut}</kbd>
              </span>
              <span className="preview-shell">
                <PageMiniature pageId={page.id} />
              </span>
              <span className="switch-card-copy">
                <strong>{page.name}</strong>
                <span>{page.hint}</span>
              </span>
              <span className="switch-card-footer">
                <span>{page.status}</span>
                <small>{isSelected ? "Click to enter" : "Click to focus"}</small>
              </span>
            </button>
          );
        })}
      </div>

      <button
        className="switch-arrow right"
        onClick={() => onSelect((index) => nextPageIndex(index, 1))}
        aria-label="Next page"
      >
        <ArrowRight size={20} />
      </button>

      <RadialWheel selectedIndex={selectedIndex} onSelect={onSelect} onConfirm={onConfirm} />

      <div className="switcher-hint">
        <span>Arrow keys / wheel to browse</span>
        <span>Enter to open</span>
        <span>Esc to cancel</span>
      </div>
    </div>
  );
}
