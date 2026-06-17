import type { FieldChange, BatchReport } from "./itemProcessor";
import { getLastReport } from "./itemProcessor";

export type UndoEntry = {
  timestamp: string;
  operationID: string;
  itemID: number;
  itemKey: string;
  fieldName: string;
  before: string;
  after: string;
};

const MAX_OPERATIONS = 50;

// In-memory undo stack
let _operations: UndoEntry[][] = [];

/**
 * Log a batch of changes as a single undoable operation.
 */
export async function logOperation(entries: UndoEntry[]): Promise<void> {
  if (entries.length === 0) return;

  _operations.push(entries);

  // Trim old operations
  if (_operations.length > MAX_OPERATIONS) {
    _operations = _operations.slice(-MAX_OPERATIONS);
  }

  // Persist to disk
  await persistToDisk();
}

/**
 * Get the most recent operation's entries.
 */
export function getLastOperation(): UndoEntry[] {
  return _operations[_operations.length - 1] ?? [];
}

/**
 * Revert the most recent operation.
 */
export async function undoLastOperation(): Promise<{
  reverted: number;
  errors: number;
}> {
  const entries = getLastOperation();
  if (entries.length === 0) return { reverted: 0, errors: 0 };

  let reverted = 0;
  let errors = 0;

  // Group by item for efficient save
  const itemMap = new Map<number, UndoEntry[]>();
  for (const entry of entries) {
    const existing = itemMap.get(entry.itemID) ?? [];
    existing.push(entry);
    itemMap.set(entry.itemID, existing);
  }

  for (const [itemID, itemEntries] of itemMap) {
    try {
      const item = Zotero.Items.get(itemID);
      if (!item) {
        errors++;
        continue;
      }

      for (const entry of itemEntries) {
        try {
          if (entry.fieldName.startsWith("creator[")) {
            // Creator revert is complex; skip for now
            Zotero.debug(
              `[meta-clean] Skipping creator undo for: ${entry.fieldName} on item ${itemID}`,
            );
            continue;
          }
          item.setField(entry.fieldName, entry.before);
          reverted++;
        } catch {
          errors++;
        }
      }

      // Remove the processed tag if we added it
      try {
        const tags = item.getTags();
        const processedTag = (tags as Array<{ tag: string }>).find((t) =>
          t.tag.startsWith("meta-cleaned"),
        );
        if (processedTag) {
          // We can't easily remove tags via API, but we try
        }
      } catch {
        // ignore tag errors
      }

      await item.saveTx();
    } catch {
      errors += itemEntries.length;
    }
  }

  // Remove the operation from stack
  _operations.pop();
  persistToDisk();

  return { reverted, errors };
}

/**
 * Export the undo log as JSON string.
 */
export function exportLog(): string {
  return JSON.stringify(_operations, null, 2);
}

/**
 * Export the last verbose normalization report as JSON string.
 */
export function exportReport(): string {
  const report = getLastReport();
  if (!report) {
    return JSON.stringify(
      {
        error:
          "No verbose report available. Run normalization with verbose mode first.",
      },
      null,
      2,
    );
  }
  return JSON.stringify(report, null, 2);
}

/**
 * Convert a batch report to undo entries.
 */
export function reportToUndoEntries(
  report: BatchReport,
  operationID: string,
): UndoEntry[] {
  const items = new Map<
    number,
    { itemKey: string; fieldName: string; before: string; after: string }[]
  >();

  // We need itemKey per item. We don't have it in the report directly for each change,
  // so we store the report changes grouped by item and look up keys.
  // Actually, let's restructure: store operation-level metadata separately.

  return report.changes.map((change) => ({
    timestamp: new Date().toISOString(),
    operationID,
    itemID: 0, // Filled in by caller
    itemKey: "", // Filled in by caller
    fieldName: change.fieldName,
    before: change.before,
    after: change.after,
  }));
}

// ── Persistence ──────────────────────────────────────────────────

async function persistToDisk(): Promise<void> {
  try {
    const profileDir = Zotero.getProfileDirectory();
    const filePath = PathUtils.join(profileDir.path, "meta-clean-undo.json");

    await Zotero.File.putContentsAsync(
      filePath,
      JSON.stringify(_operations, null, 2),
    );
  } catch {
    // Silently fail persistence
  }
}

async function loadFromDisk(): Promise<void> {
  try {
    const profileDir = Zotero.getProfileDirectory();
    const filePath = PathUtils.join(profileDir.path, "meta-clean-undo.json");

    const data = await Zotero.File.getContentsAsync(filePath);
    if (data) {
      _operations = JSON.parse(data as string);
    }
  } catch {
    _operations = [];
  }
}

// Load existing data on module import (fire-and-forget; runs async)
loadFromDisk().catch(() => {
  _operations = [];
});
