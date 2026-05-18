import { requireNativeModule } from 'expo-modules-core';

interface ICloudNative {
  getContainerPath(): Promise<string>;
}

export async function getICloudContainerPath(): Promise<string> {
  const ICloud = requireNativeModule<ICloudNative>('ICloud');
  return ICloud.getContainerPath();
}
