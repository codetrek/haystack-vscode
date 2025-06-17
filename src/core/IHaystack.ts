import { AxiosResponse } from 'axios';
import type { EventEmitter } from 'events';

export type Status = 'initializing' | 'starting' | 'running' | 'unsupported' | 'error';
export type DownloadProgress = {
  url: string;
  totalSize: number;
  downloadedSize: number;
  percent: number;
};
export type InstallStatus =
  | 'initializing'
  | 'downloading'
  | 'extracting'
  | 'unsupported'
  | 'error'
  | 'installed'
  | 'not-installed';

export interface IHaystack extends EventEmitter {
  connected: boolean;
  post(uri: string, data: unknown): Promise<AxiosResponse<unknown, unknown>>;
  postStream(uri: string, data: unknown): Promise<ReadableStream<Uint8Array>>;
  getCurrentPlatform(): string;
  getStatus(): Status;
  getDownloadProgress(): DownloadProgress;
  getRetryCount(): number;
  getInstallStatus(): InstallStatus;
  getIsSupported(): boolean;
  startServer(): boolean;
}
