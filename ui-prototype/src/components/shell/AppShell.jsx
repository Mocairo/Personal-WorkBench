import React from "react";
import { PageSwitcher } from "./PageSwitcher";
import { FloatingControlBar } from "./FloatingControlBar";
import { WindowTitleBar } from "./WindowTitleBar";
import { SettingsPanel } from "../../pages/Settings";
import { usePageNavigation } from "../../hooks/usePageNavigation";
import { getGlobalKeyboardAction } from "../../hooks/keyboardShortcuts";
import { pageComponents } from "../../pages/pageComponents";

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const {
    activeIndex,
    activePage,
    closeSwitcher,
    confirmPage,
    navigateToPageId,
    openSwitcher,
    selectedIndex,
    selectedPage,
    setSelectedIndex,
    switcherOpen,
  } = usePageNavigation();

  const CurrentPage = pageComponents[activePage.id];

  React.useEffect(() => {
    if (!switcherOpen) {
      document.body.classList.remove("switcher-lock");
      return;
    }

    document.body.classList.add("switcher-lock");
    window.scrollTo({ left: 0, top: 0 });

    return () => {
      document.body.classList.remove("switcher-lock");
    };
  }, [switcherOpen]);

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (getGlobalKeyboardAction(event) !== "toggle-settings") {
        return;
      }

      event.preventDefault();
      closeSwitcher();
      setSettingsOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSwitcher]);

  return (
    <main className={`desktop-stage ${switcherOpen ? "is-switching" : ""}`}>
      <div className="ambient-field" aria-hidden="true" />
      <section className="app-window" aria-label="Local desktop console prototype">
        <WindowTitleBar activePage={activePage} />
        <FloatingControlBar
          activePage={activePage}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSwitcher={openSwitcher}
        />
        <div className="page-layer">
          <CurrentPage onNavigate={navigateToPageId} />
        </div>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
        {switcherOpen && (
          <PageSwitcher
            activeIndex={activeIndex}
            selectedIndex={selectedIndex}
            selectedPage={selectedPage}
            onSelect={setSelectedIndex}
            onConfirm={confirmPage}
            onClose={closeSwitcher}
          />
        )}
      </section>
    </main>
  );
}
