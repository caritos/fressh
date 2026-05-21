import { File, Paths } from 'expo-file-system';

export interface DbConfig {
  databasePath: string;
}

function configFile(): File {
  return new File(Paths.document, 'fressh-config.json');
}

export function appStoragePath(): string {
  const docUri = Paths.document.uri.replace(/^file:\/\//, '').replace(/\/$/, '');
  return `${docUri}/SQLite/fressh.db`;
}

export async function loadDbConfig(): Promise<DbConfig | null> {
  try {
    const file = configFile();
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as DbConfig;
  } catch {
    return null;
  }
}

export async function saveDbConfig(config: DbConfig): Promise<void> {
  const file = configFile();
  file.write(JSON.stringify(config));
}
