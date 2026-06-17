import { UIFactory } from "./modules/menus";
import { initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/prefsUI";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register preference pane
  UIFactory.registerPrefs();

  // Register notifier for auto-processing
  UIFactory.registerNotifier();

  // Register quick-search commands
  UIFactory.registerCommands();

  // Load existing windows
  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Register stylesheet
  UIFactory.registerStyleSheet(win);

  // Register right-click menus
  UIFactory.registerRightClickMenus();

  // Register Tools menu entries
  UIFactory.registerWindowMenus();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * Dispatch notifier events.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {
  // Notifier is handled by the module; this hook is for additional dispatch if needed
  ztoolkit.log("notify", event, type, ids);
}

/**
 * Dispatch preference pane events.
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  // Reserved for future keyboard shortcuts
  ztoolkit.log("shortcut", type);
}

function onDialogEvents(type: string) {
  // Reserved for future dialog events
  ztoolkit.log("dialog", type);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
