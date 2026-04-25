import path from 'path';

export function getDataDir(): string {
  const override = process.env.WAUTOCHAT_DATA_DIR;
  if (override) return override;

  // When packaged in Electron, write to userData so the app survives upgrades
  // and isn't bound to the install location. Detect Electron via process.versions.
  const isElectron = typeof process !== 'undefined' && !!(process.versions as Record<string, string | undefined>).electron;
  if (isElectron) {
    try {
      const { app } = require('electron');
      if (app?.getPath) return path.join(app.getPath('userData'), 'data');
    } catch {
      // Not in main process, or electron not available — fall through.
    }
  }

  return path.join(process.cwd(), 'data');
}
