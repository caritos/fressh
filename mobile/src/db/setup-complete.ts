let _onComplete: (() => void) | null = null;

export function registerSetupCompleteCallback(cb: () => void): void {
  _onComplete = cb;
}

export function notifySetupComplete(): void {
  _onComplete?.();
}
