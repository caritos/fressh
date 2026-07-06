let currentKey: string | null = null;
let currentIds: number[] = [];

export function setReaderSession(key: string, ids: number[]): void {
  currentKey = key;
  currentIds = ids;
}

export function getReaderSession(key: string): number[] | null {
  return currentKey === key ? currentIds : null;
}
