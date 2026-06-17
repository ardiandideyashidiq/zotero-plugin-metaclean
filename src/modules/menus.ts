import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { registerNotifier } from "./notifier";
import {
  processSelectedItems,
  processCollection,
  processLibrary,
  processItems,
  type ProcessOptions,
  type BatchReport,
  type FieldChange,
} from "./itemProcessor";
import { processItemsInBatches } from "./batchProcessor";
import {
  logOperation,
  undoLastOperation,
  exportLog,
  exportReport,
} from "./undoLog";
import type { CaseMode } from "./fieldRegistry";

interface MenuManagerRegisterOptions {
  menuID: string;
  pluginID: string;
  target: string;
  menus: any[];
}

const MenuManager = (Zotero as any).MenuManager as {
  registerMenu(options: MenuManagerRegisterOptions): string | false;
};

function getZoteroPane(): any {
  return ztoolkit.getGlobal("ZoteroPane");
}

function buildOptions(mode?: CaseMode): ProcessOptions {
  return {
    mode,
    dryRun: false,
    addTag: getPref("addTagAfterProcessing") || "meta-cleaned",
    skipTag: getPref("skipTag") || "meta-clean-skip",
    exceptions: parseExceptionWords(getPref("exceptionWords")),
    processCreators: getPref("processCreators"),
  };
}

function buildPreviewOptions(): ProcessOptions {
  return {
    mode: undefined,
    dryRun: true,
    addTag: false,
    skipTag: getPref("skipTag") || "meta-clean-skip",
    exceptions: parseExceptionWords(getPref("exceptionWords")),
    processCreators: getPref("processCreators"),
  };
}

async function showCompletion(
  report: BatchReport,
  mode: string,
): Promise<void> {
  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: `${mode}: ${report.changed} of ${report.total} items changed`,
      type: report.errors > 0 ? "warning" : "success",
      progress: 100,
    })
    .show();

  if (report.changed > 0) {
    await logOperation(
      report.changes.map((c) => ({
        timestamp: new Date().toISOString(),
        operationID: `${Date.now()}`,
        itemID: 0,
        itemKey: "",
        fieldName: c.fieldName,
        before: c.before,
        after: c.after,
      })),
    );
  }

  if (report.errors > 0) {
    pw.createLine({
      text: `${report.errors} error(s) occurred`,
      type: "warning",
      progress: 100,
    });
  }
}

async function doNormalizeSelected(mode?: CaseMode): Promise<void> {
  const options = buildOptions(mode);
  const report = await processSelectedItems(options);
  await showCompletion(report, mode ?? "smart");
}

async function doNormalizeCollection(mode?: CaseMode): Promise<void> {
  const collectionID = getZoteroPane().getSelectedCollection();
  if (!collectionID) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "No collection selected",
        type: "warning",
        progress: 100,
      })
      .show();
    return;
  }

  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: "Loading collection items...",
      type: "default",
      progress: 0,
    })
    .show(-1);

  const collection = Zotero.Collections.get(collectionID);
  if (!collection) {
    pw.changeLine({
      text: "Collection not found",
      progress: 100,
      type: "warning",
    });
    return;
  }

  const itemIDs = collection.getChildItems();
  const items: Zotero.Item[] = [];
  for (const id of itemIDs) {
    try {
      const item =
        typeof id === "number"
          ? Zotero.Items.get(id)
          : Zotero.Items.getByLibraryAndKey(0, String(id));
      if (item) items.push(item);
    } catch {
      // skip
    }
  }

  if (items.length === 0) {
    pw.changeLine({
      text: "Collection is empty",
      progress: 100,
      type: "warning",
    });
    return;
  }

  pw.changeLine({ text: `Processing 0/${items.length} items...`, progress: 0 });

  const baseOpts = buildOptions(mode);
  const report = await processItemsInBatches({
    items,
    batchSize: 100,
    batchDelay: 50,
    verbose: true,
    onProgress: (progress) => {
      const pct = Math.round((progress.done / progress.total) * 100);
      pw.changeLine({
        text: `Processing ${progress.done}/${progress.total} items (${progress.changed} changed, ${progress.errors} errors)`,
        progress: pct,
      });
    },
    ...baseOpts,
  });

  pw.win.close();
  await showCompletion(report, mode ?? "smart");
}

async function doNormalizeLibrary(mode?: CaseMode): Promise<void> {
  const libraryID = getZoteroPane().getSelectedLibraryID();

  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: "Searching library items...",
      type: "default",
      progress: 0,
    })
    .show(-1);

  const s = new Zotero.Search();
  s.addCondition("libraryID", "is", String(libraryID));
  s.addCondition("itemType", "isNot", "attachment");
  s.addCondition("itemType", "isNot", "note");

  let ids;
  try {
    ids = await s.search();
  } catch {
    pw.changeLine({ text: "Search failed", progress: 100, type: "warning" });
    return;
  }
  if (!ids || !ids.length) {
    pw.changeLine({
      text: "No items found in library",
      progress: 100,
      type: "default",
    });
    return;
  }

  pw.changeLine({ text: `Loading ${ids.length} items...`, progress: 0 });

  const items: Zotero.Item[] = [];
  for (const id of ids) {
    try {
      items.push(Zotero.Items.get(id as number));
    } catch {
      // skip
    }
  }

  pw.changeLine({ text: `Processing 0/${items.length} items...`, progress: 0 });

  const baseOpts = buildOptions(mode);
  const report = await processItemsInBatches({
    items,
    batchSize: 100,
    batchDelay: 50,
    verbose: true,
    onProgress: (progress) => {
      const pct = Math.round((progress.done / progress.total) * 100);
      pw.changeLine({
        text: `Processing ${progress.done}/${progress.total} items (${progress.changed} changed, ${progress.errors} errors)`,
        progress: pct,
      });
    },
    ...baseOpts,
  });

  pw.win.close();
  await showCompletion(report, mode ?? "smart");
}

async function doPreview(): Promise<void> {
  const items = getZoteroPane().getSelectedItems();
  if (items.length === 0) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "No items selected",
        type: "warning",
        progress: 100,
      })
      .show();
    return;
  }

  const options = buildPreviewOptions();
  const report = await processItems(items, options);

  if (report.changes.length === 0) {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "No changes needed for selected items",
        type: "default",
        progress: 100,
      })
      .show();
    return;
  }

  await showPreviewDialog(report, items);
}

async function showPreviewDialog(
  report: BatchReport,
  items: Zotero.Item[],
): Promise<void> {
  const itemMap = new Map<number, Zotero.Item>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Group changes by item
  const changeGroups = new Map<number, FieldChange[]>();
  for (const change of report.changes) {
    // changes don't carry itemID directly in this context,
    // so we show them flat
  }

  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: `Preview: ${report.changes.length} change(s) across ${report.changed} item(s)`,
      type: "default",
      progress: 100,
    })
    .show();

  // Show up to 5 sample changes as additional lines
  const sampleChanges = report.changes.slice(0, 5);
  for (const change of sampleChanges) {
    const before =
      change.before.length > 40
        ? change.before.slice(0, 37) + "..."
        : change.before;
    const after =
      change.after.length > 40
        ? change.after.slice(0, 37) + "..."
        : change.after;
    pw.createLine({
      text: `${change.fieldName}: "${before}" → "${after}"`,
      type: "default",
      progress: 100,
    });
  }

  if (report.changes.length > 5) {
    pw.createLine({
      text: `... and ${report.changes.length - 5} more change(s)`,
      type: "default",
      progress: 100,
    });
  }
}

async function doUndo(): Promise<void> {
  const result = await undoLastOperation();
  new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: `Undo: ${result.reverted} field(s) reverted`,
      type: result.errors > 0 ? "warning" : "success",
      progress: 100,
    })
    .show();
}

function doExportLog(): void {
  const log = exportLog();
  try {
    new ztoolkit.Clipboard().addText(log, "text/unicode").copy();
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "Undo log copied to clipboard",
        type: "success",
        progress: 100,
      })
      .show();
  } catch {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "Failed to export log",
        type: "warning",
        progress: 100,
      })
      .show();
  }
}

function doExportReport(): void {
  const report = exportReport();
  try {
    new ztoolkit.Clipboard().addText(report, "text/unicode").copy();
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "Normalization report copied to clipboard",
        type: "success",
        progress: 100,
      })
      .show();
  } catch {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "Failed to export report",
        type: "warning",
        progress: 100,
      })
      .show();
  }
}

export class UIFactory {
  static registerPrefs(): void {
    Zotero.PreferencePanes.register({
      pluginID: addon.data.config.addonID,
      src: rootURI + "content/preferences.xhtml",
      label: getString("prefs-title"),
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
    });
  }

  static registerNotifier(): void {
    registerNotifier();
  }

  static registerStyleSheet(win: _ZoteroTypes.MainWindow): void {
    const doc = win.document;
    const styles = ztoolkit.UI.createElement(doc, "link", {
      properties: {
        type: "text/css",
        rel: "stylesheet",
        href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
      },
    });
    doc.documentElement?.appendChild(styles);
  }

  static registerRightClickMenus(): void {
    const id = addon.data.config.addonRef;
    const icon = `chrome://${id}/content/icons/favicon@0.5x.png`;

    MenuManager.registerMenu({
      menuID: `${id}-rightclick`,
      pluginID: addon.data.config.addonID,
      target: "main/library/item",
      menus: [
        {
          menuType: "submenu",
          l10nID: `${id}-menu-parent`,
          icon,
          menus: [
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-smart`,
              onCommand: () => doNormalizeSelected(undefined),
            },
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-sentence`,
              onCommand: () => doNormalizeSelected("sentence"),
            },
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-title`,
              onCommand: () => doNormalizeSelected("title"),
            },
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-lower`,
              onCommand: () => doNormalizeSelected("lower"),
            },
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-upper`,
              onCommand: () => doNormalizeSelected("upper"),
            },
            { menuType: "separator" },
            {
              menuType: "menuitem",
              l10nID: `${id}-menuitem-preview`,
              onCommand: () => doPreview(),
            },
          ],
        },
      ],
    });
  }

  static registerWindowMenus(): void {
    const id = addon.data.config.addonRef;
    const icon = `chrome://${id}/content/icons/favicon.png`;

    MenuManager.registerMenu({
      menuID: `${id}-tools`,
      pluginID: addon.data.config.addonID,
      target: "main/menubar/tools",
      menus: [
        { menuType: "separator" },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-selected`,
          icon,
          onCommand: () => doNormalizeSelected(undefined),
        },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-collection`,
          icon,
          onCommand: () => doNormalizeCollection(undefined),
        },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-library`,
          icon,
          onCommand: () => doNormalizeLibrary(undefined),
        },
        { menuType: "separator" },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-undo`,
          icon,
          onCommand: () => doUndo(),
        },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-export-log`,
          icon,
          onCommand: () => doExportLog(),
        },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-export-report`,
          icon,
          onCommand: () => doExportReport(),
        },
        { menuType: "separator" },
        {
          menuType: "menuitem",
          l10nID: `${id}-menuitem-settings`,
          icon,
          onCommand: () => {
            // @ts-expect-error - openPreferences exists at runtime
            Zotero.openPreferences(addon.data.config.addonID);
          },
        },
      ],
    });
  }

  static registerCommands(): void {
    ztoolkit.Prompt.register([
      {
        name: "Normalize Selected Items (Smart)",
        label: "MetaClean",
        when: () => {
          try {
            return getZoteroPane().getSelectedItems().length > 0;
          } catch {
            return false;
          }
        },
        callback: () => doNormalizeSelected(undefined),
      },
    ]);
  }
}

function parseExceptionWords(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
