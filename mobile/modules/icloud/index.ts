import { requireNativeModule } from 'expo-modules-core';

interface ICloudNative {
  getContainerPath(): Promise<string>;
}

const ICloud = requireNativeModule<ICloudNative>('ICloud');

export async function getICloudContainerPath(): Promise<string> {
  return ICloud.getContainerPath();
}
