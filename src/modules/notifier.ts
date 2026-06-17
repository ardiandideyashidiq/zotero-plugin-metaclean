import { getPref } from "../utils/prefs";
import { processItem } from "./itemProcessor";

const processing = new Set<number>();

let _registered = false;

export function registerNotifier(): void {
  if (_registered) return;

  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: Array<number | string>,
      _extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        return;
      }

      if (type !== "item") return;
      if (!["add", "modify"].includes(event)) return;

      const auto = getPref("autoProcessNewItems");
      if (!auto) return;

      const enabled = getPref("enabled");
      if (!enabled) return;

      for (const id of ids) {
        const numId = typeof id === "number" ? id : parseInt(id, 10);
        if (isNaN(numId)) continue;
        if (processing.has(numId)) continue;

        try {
          processing.add(numId);

          const item = Zotero.Items.get(numId);
          if (!item || !item.isRegularItem()) continue;

          const report = await processItem(item, {
            dryRun: false,
            addTag: getPref("addTagAfterProcessing") || undefined,
            skipTag: getPref("skipTag") || undefined,
            exceptions: parseExceptionWords(getPref("exceptionWords")),
          });

          if (report?.changed) {
            Zotero.debug(
              `[meta-clean] Auto-normalized item ${numId}: ${report.changes.length} fields`,
            );
          }
        } catch {
          // Silently skip errors on auto-process
        } finally {
          processing.delete(numId);
        }
      }
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, ["item"]);

  Zotero.Plugins.addObserver({
    shutdown: ({ id }: { id: string }) => {
      if (id === addon.data.config.addonID) {
        Zotero.Notifier.unregisterObserver(notifierID);
        _registered = false;
      }
    },
  });

  _registered = true;
}

function parseExceptionWords(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
