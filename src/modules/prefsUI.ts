import { config } from "../../package.json";

export async function registerPrefsScripts(_window: Window): Promise<void> {
  // Prefs window reference for UI updates
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }

  // Let Zotero handle the preference bindings via the `preference` attribute
  // on XUL elements — no custom event binding needed for basic cases.
}

export function updatePrefsUI(): void {
  // Reserved for future dynamic UI updates
}
