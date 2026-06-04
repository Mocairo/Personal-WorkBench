import { useEffect, useState } from "react";
import { pages } from "../data/pageRegistry";
import { nextPageIndex, shortcutToIndex } from "../navigation";
import { getGlobalKeyboardAction } from "./keyboardShortcuts";

export function usePageNavigation() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      const directIndex = shortcutToIndex(event);
      if (directIndex !== null) {
        event.preventDefault();
        setActiveIndex(directIndex);
        setSelectedIndex(directIndex);
        setSwitcherOpen(false);
        return;
      }

      if (getGlobalKeyboardAction(event) === "open-switcher") {
        event.preventDefault();
        setSelectedIndex(activeIndex);
        setSwitcherOpen(true);
        return;
      }

      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        setActiveIndex((index) => {
          const next = nextPageIndex(index, direction);
          setSelectedIndex(next);
          return next;
        });
        return;
      }

      if (!switcherOpen) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setActiveIndex(selectedIndex);
        setSwitcherOpen(false);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((index) => nextPageIndex(index, 1));
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((index) => nextPageIndex(index, -1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, selectedIndex, switcherOpen]);

  const openSwitcher = () => {
    setSelectedIndex(activeIndex);
    setSwitcherOpen(true);
  };

  const closeSwitcher = () => setSwitcherOpen(false);

  const confirmPage = (index) => {
    setActiveIndex(index);
    setSelectedIndex(index);
    setSwitcherOpen(false);
  };

  return {
    activeIndex,
    activePage: pages[activeIndex],
    closeSwitcher,
    confirmPage,
    openSwitcher,
    selectedIndex,
    selectedPage: pages[selectedIndex],
    setSelectedIndex,
    switcherOpen,
  };
}
