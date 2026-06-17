import type {
  ProcessOptions,
  BatchReport,
  ItemProcessReport,
} from "./itemProcessor";
import { processItem } from "./itemProcessor";

export type BatchProgress = {
  done: number;
  total: number;
  processed: number;
  skipped: number;
  changed: number;
  errors: number;
};

export type BatchOptions = ProcessOptions & {
  /** Items to process */
  items: Zotero.Item[];
  /** Number of items per batch */
  batchSize?: number;
  /** Delay between batches in ms */
  batchDelay?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Callback for progress updates */
  onProgress?: (progress: BatchProgress) => void;
};

export async function processItemsInBatches(
  options: BatchOptions,
): Promise<BatchReport> {
  const {
    items,
    batchSize = 100,
    batchDelay = 50,
    signal,
    onProgress,
    ...processOpts
  } = options;

  const report: BatchReport = {
    total: items.length,
    processed: 0,
    skipped: 0,
    changed: 0,
    errors: 0,
    errorItems: [],
    changes: [],
  };

  let done = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    // Check cancellation
    if (signal?.aborted) {
      break;
    }

    const batch = items.slice(i, i + batchSize);

    for (const item of batch) {
      if (signal?.aborted) break;

      try {
        const result = await processItem(item, processOpts);
        done++;

        if (!result) {
          report.skipped++;
          continue;
        }

        report.processed++;

        if (result.changed) {
          report.changed++;
          report.changes.push(...result.changes);
        } else {
          report.skipped++;
        }
      } catch (e) {
        report.errors++;
        report.errorItems.push({
          itemID: item.id,
          error: String(e),
        });
        done++;
      }
    }

    // Progress callback
    onProgress?.({
      done,
      total: items.length,
      processed: report.processed,
      skipped: report.skipped,
      changed: report.changed,
      errors: report.errors,
    });

    // Delay between batches to avoid UI lockup
    if (i + batchSize < items.length) {
      await Zotero.Promise.delay(batchDelay);
    }
  }

  return report;
}

export function showBatchProgress(report: BatchReport): void {
  const lines: string[] = [];
  lines.push(`Processed: ${report.processed}`);
  lines.push(`Changed: ${report.changed}`);
  lines.push(`Skipped: ${report.skipped}`);
  if (report.errors > 0) {
    lines.push(`Errors: ${report.errors}`);
  }

  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: `Normalization complete: ${report.changed} of ${report.total} items changed`,
      type: report.errors > 0 ? "warning" : "success",
      progress: 100,
    })
    .show();
}
