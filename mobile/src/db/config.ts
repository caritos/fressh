import { File, Paths } from 'expo-file-system';

export interface DbConfig {
  databasePath: string;
}

function configFile(): File {
  return new File(Paths.document, 'fressh-config.json');
}

export async function loadDbConfig(): Promise<DbConfig | null> {
  try {
    const file = configFile();
    if (!file.exists) return null;
    const text = await file.text();
    return JSON.parse(text) as DbConfig;
  } catch {
    return null;
  }
}

export async function saveDbConfig(config: DbConfig): Promise<void> {
  const file = configFile();
  file.write(JSON.stringify(config));
}
