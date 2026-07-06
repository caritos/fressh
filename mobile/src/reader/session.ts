// Intentionally module-scoped (not persisted): this singleton resets on process
// restart — e.g. Metro Fast Refresh during development, or an app relaunch after
// a force-quit. That's expected, not a bug: a fresh reader entry via the list
// screen's `onTap` always re-populates it via `setReaderSession` before use.
let currentKey: string | null = null;
let currentIds: number[] = [];

export function setReaderSession(key: string, ids: number[]): void {
  currentKey = key;
  currentIds = ids;
}

export function getReaderSession(key: string): number[] | null {
  return currentKey === key ? currentIds : null;
}
