export function getGlobalKeyboardAction(event) {
  if (event.altKey && event.code === "KeyQ") {
    return "open-switcher";
  }

  if (event.key === "Escape") {
    return "toggle-settings";
  }

  return null;
}
