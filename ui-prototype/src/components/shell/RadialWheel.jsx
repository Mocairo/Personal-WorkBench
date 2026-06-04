import React from "react";
import { LayoutGrid } from "lucide-react";
import { pages } from "../../data/pageRegistry";
import { pageIcons } from "../pageIcons";

export function RadialWheel({ selectedIndex, onSelect, onConfirm }) {
  return (
    <div className="radial-wheel" aria-label="Circular page wheel">
      <div className="wheel-core">
        <LayoutGrid size={18} />
      </div>
      {pages.map((page, index) => {
        const Icon = pageIcons[page.id];
        const angle = (index / pages.length) * 360 - 90;
        const isSelected = index === selectedIndex;
        return (
          <button
            className={`wheel-node ${isSelected ? "selected" : ""}`}
            key={page.id}
            style={{
              "--angle": `${angle}deg`,
              "--accent": page.accent,
            }}
            title={page.name}
            onClick={() => (isSelected ? onConfirm(index) : onSelect(index))}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
