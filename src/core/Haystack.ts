import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios, { AxiosInstance } from 'axios';
import { exec } from 'child_process';
import { EventEmitter } from 'events';
import https from 'https';
import http from 'http';
import AdmZip from 'adm-zip';
import type { IHaystack, Status, DownloadProgress, InstallStatus } from './IHaystack';
import YAML from 'js-yaml';

const supportedPlatforms = {
  'linux-amd64': true,
  'linux-arm64': true,
  'darwin-amd64': true,
  'darwin-arm64': true,
  'windows-amd64': true,
  'windows-arm64': true,
};

// Haystack ports
const GLOBAL_PORT = 13134;
const LOCAL_PORT = 13135;

// Haystack config

interface HaystackConfig {
  global: {
    data_path: string;
    port: number;
    socket_path: string;
  };
  client: {
    default_limit: {
      max_results: number;
      max_results_per_file: number;
    };
  };
}

const defaultHaystackConfig = (context: vscode.ExtensionContext): HaystackConfig => {
  const dataPath = path.join(context.globalStorageUri.fsPath, 'data');
  const useSocket = os.platform() !== 'win32'; // Golang supports but Node.js doesn't...
  return {
    global: {
      data_path: dataPath,
      port: useSocket ? 0 : LOCAL_PORT,
      socket_path: useSocket ? `/tmp/haystack-${os.userInfo().uid}.sock` : '',
    },
    client: {
      default_limit: {
        max_results: 500,
        max_results_per_file: 50,
      },
    },
  };
};

const platform = () => {
  if (process.platform === 'win32') {
    return 'windows';
  }
  return process.platform;
};

const arch = () => {
  if (process.arch === 'x64') {
    return 'amd64';
  }
  return process.arch;
};

// Get the appropriate host based on the environment
function getHaystackHost(): string {
  // If we're in a remote environment, use the remote host
  if (vscode.env.remoteName) {
    // In remote environment, we can safely use localhost
    return 'localhost';
  }

  // In local environment, prefer 127.0.0.1 for better compatibility
  return '127.0.0.1';
}

const currentPlatform = `${platform()}-${arch()}`;
const isHaystackSupported =
  supportedPlatforms[currentPlatform as keyof typeof supportedPlatforms] || false;
const HAYSTACK_DOWNLOAD_URL = 'https://github.com/CodeTrek/haystack/releases/download/';
const HAYSTACK_DOWNLOAD_URL_FALLBACK = 'https://haystack.codetrek.cn/download/';

export type HaystackEvent =
  | 'status-change'
  | 'install-status-change'
  | 'starting'
  | 'download-progress'
  | 'error'
  | 'connected';

export class Haystack extends EventEmitter implements IHaystack {
  private coreFilePath: string;
  private binDir: string;
  private _status: Status;
  private _installStatus: InstallStatus;
  private downloadZipPath: string;
  private builtinZipPath: string;
  private haystackVersion: string;
  private haystackConfig: HaystackConfig;
  private HAYSTACK_ZIP_FILE_NAME: string;
  private _downloadProgress: DownloadProgress;
  private _startRetry: number;
  private _connected: boolean;
  private _axios: AxiosInstance;

  private get runningPort(): number {
    return this.useLocalServer ? this.haystackConfig.global.port : GLOBAL_PORT;
  }

  constructor(
    private context: vscode.ExtensionContext,
    private useLocalServer: boolean,
  ) {
    super();
    // Use globalStorageUri for persistent storage across extension updates
    this.binDir = this.context.globalStorageUri.fsPath;
    this.coreFilePath = path.join(this.binDir, this.getExecutableName());
    this.downloadZipPath = path.join(this.context.globalStorageUri.fsPath, 'download');
    this.builtinZipPath = path.join(this.context.extensionPath, 'pkgs'); // We may have builtin zip files
    this._status = 'initializing';
    this._installStatus = 'initializing';
    this.haystackVersion = 'v' + context.extension.packageJSON.haystackVersion;
    this.haystackConfig = defaultHaystackConfig(this.context);
    this.HAYSTACK_ZIP_FILE_NAME = `haystack-${currentPlatform}-${this.haystackVersion}.zip`;
    this._startRetry = 0;
    this._connected = false;
    this._downloadProgress = {
      url: '',
      totalSize: 0,
      downloadedSize: 0,
      percent: 0,
    };
    this._axios = axios.create({
      baseURL: this.getUrl(),
      timeout: 30e3, // 30 seconds
      socketPath: this.getSocketPath(),
    });
    setTimeout(async () => {
      await this.doInit();
    }, 1);
  }

  public async post(uri: string, data: unknown) {
    if (this._status !== 'running') {
      throw new Error('Haystack is not running');
    }

    console.log(`POST to ${this.getUrl()}${uri} with data:`, data);

    try {
      const response = await this._axios.post(uri, data);
      this.connected = true;
      return response;
    } catch (error: unknown) {
      const errorMessage =
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (error as { message?: string })?.message ||
        String(error);
      if (
        ['ECONNREFUSED', 'ENOENT', 'Failed to connect'].some((text) => errorMessage.includes(text))
      ) {
        this.connected = false;
      }

      throw error;
    }
  }

  public async postStream(uri: string, data: unknown): Promise<ReadableStream<Uint8Array>> {
    if (this._status !== 'running') {
      throw new Error('Haystack is not running');
    }

    try {
      const response = await this._axios.request({
        method: 'POST',
        url: uri,
        data,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      this.connected = true;

      // Convert Node.js stream to Web ReadableStream
      const nodeStream = response.data as http.IncomingMessage;
      return new ReadableStream({
        start(controller) {
          let isClosed = false;

          nodeStream.on('data', (chunk: Buffer) => {
            if (!isClosed) {
              try {
                controller.enqueue(new Uint8Array(chunk));
              } catch (error) {
                // Controller might be closed due to cancellation or error
                if (!isClosed) {
                  console.warn('Failed to enqueue data to stream controller:', error);
                  isClosed = true;
                }
              }
            }
          });

          nodeStream.on('end', () => {
            if (!isClosed) {
              try {
                controller.close();
                isClosed = true;
              } catch (error) {
                // Controller might already be closed
                console.warn('Failed to close stream controller:', error);
              }
            }
          });

          nodeStream.on('error', (error: Error) => {
            if (!isClosed) {
              try {
                controller.error(error);
                isClosed = true;
              } catch (controllerError) {
                // Controller might already be closed
                console.warn('Failed to error stream controller:', controllerError);
              }
            }
          });
        },
        cancel(reason) {
          // Clean up the Node.js stream when the ReadableStream is cancelled
          if (nodeStream && typeof nodeStream.destroy === 'function') {
            nodeStream.destroy();
          }
          console.log('Stream cancelled:', reason);
        },
      });
    } catch (error: unknown) {
      const errorMessage = (error as { message?: string })?.message || String(error);
      if (
        ['ECONNREFUSED', 'ENOENT', 'Failed to connect'].some((text) => errorMessage.includes(text))
      ) {
        this.connected = false;
      }

      throw error;
    }
  }

  public set connected(newStatus: boolean) {
    if (this._connected === newStatus) {
      return;
    }

    this._connected = newStatus;
    this.emit('connected', newStatus);
  }

  public get connected(): boolean {
    return this._connected;
  }

  public isRunningLocally() {
    return this.useLocalServer;
  }

  private getUrl(): string {
    return `http://${getHaystackHost()}:${this.runningPort}`;
  }

  private getSocketPath(): string | undefined {
    const socketPath = this.haystackConfig.global.socket_path;
    if (!socketPath || socketPath === '') {
      return undefined;
    }
    return path.isAbsolute(socketPath) ? socketPath : path.join(os.tmpdir(), socketPath);
  }

  public getIsSupported(): boolean {
    return isHaystackSupported;
  }

  public getCurrentPlatform(): string {
    return currentPlatform;
  }

  // Gets the current status
  public getStatus(): Status {
    return this._status;
  }

  public getDownloadProgress(): DownloadProgress {
    return this._downloadProgress;
  }

  public getRetryCount(): number {
    return this._startRetry;
  }

  // Sets the status and emits a status-change event
  private set status(newStatus: Status) {
    if (this._status !== newStatus) {
      const oldStatus = this._status;
      this._status = newStatus;
      this.emit('status-change', {
        oldStatus,
        newStatus,
      });
      if (newStatus === 'error') {
        this.emit('error', { message: 'Haystack status changed to error state' });
      }
    }
  }

  private get status(): Status {
    return this._status;
  }

  // Gets the current installation status
  public getInstallStatus(): InstallStatus {
    return this._installStatus;
  }

  // Sets the installation status and emits an install-status-change event
  private set installStatus(newStatus: InstallStatus) {
    if (this._installStatus !== newStatus) {
      const oldStatus = this._installStatus;
      this._installStatus = newStatus;
      this.emit('install-status-change', {
        oldStatus,
        newStatus,
      });

      if (newStatus === 'error') {
        this.emit('error', { message: 'Haystack installation error' });
      }
    }
  }

  private get installStatus(): InstallStatus {
    return this._installStatus;
  }

  private getExecutableName(): string {
    return platform() === 'windows' ? 'haystack.exe' : 'haystack';
  }

  /**
   * Checks if the Haystack Core executable exists in the designated binary directory.
   * It first ensures the binary directory exists.
   * @returns True if the core executable exists, false otherwise.
   */
  private async doInit(): Promise<void> {
    if (!this.getIsSupported()) {
      this.status = 'unsupported';
      this.installStatus = 'unsupported';
      return;
    }

    if (!this.isRunningLocally()) {
      // Always set status to running if not run local server
      this.status = 'running';
      return;
    }

    try {
      // Ensure the target directory exists, creating it if necessary.
      await fs.promises.mkdir(this.binDir, { recursive: true });
      // Check for the existence of the core executable file.
      await fs.promises.access(this.coreFilePath, fs.constants.F_OK);
      console.log(`Haystack Core found at: ${this.coreFilePath}`);
      this.installStatus = 'installed';
    } catch (error) {
      // Log if the core executable is not found.
      console.log(
        `Haystack Core not found or accessible at: ${this.coreFilePath}, error: ${error}`,
      );
      this.installStatus = 'not-installed';
    }

    if (this.installStatus === 'installed') {
      // We have to check if installed or running a compatible version
      await this.checkIsCompatibleVersion();
    }

    if (this.installStatus === 'not-installed') {
      await this.install();
    }

    console.log(`Install status: ${this.installStatus}, status: ${this.status}`);

    if (this.installStatus !== 'installed') {
      this.status = 'error';
      return;
    }

    // Read haystack config
    try {
      const configPath = path.join(this.binDir, 'config.yaml');
      const configContent = await fs.promises.readFile(configPath, 'utf8');
      this.haystackConfig = YAML.load(configContent) as HaystackConfig;
    } catch (error) {
      console.error(`Failed to read Haystack config: ${error}`);
      this.status = 'error';
      return;
    }

    if (this.status !== 'running') {
      this.status = 'starting';
      this._startRetry = 0;
      await this.start();
    }
  }

  private async install(): Promise<void> {
    try {
      await fs.promises.mkdir(this.downloadZipPath, { recursive: true });

      const downloadedZipPath = path.join(this.downloadZipPath, this.HAYSTACK_ZIP_FILE_NAME);
      const builtinZipFilePath = path.join(this.builtinZipPath, this.HAYSTACK_ZIP_FILE_NAME);

      // Step 1: Check if zip already exists in download directory
      try {
        await this.checkExistingZip(downloadedZipPath, true);
        console.log('Found downloaded zip file');
        await this.extractZip(downloadedZipPath);
        await this.writeVersionAndConf(this.haystackVersion);
        console.log(`Installed from downloaded zip file: ${downloadedZipPath}`);
        this.installStatus = 'installed';
        return;
      } catch (error) {
        console.log('No downloaded zip file found:', error);
      }

      // Step 2: Check if zip exists in builtin directory
      try {
        await this.checkExistingZip(builtinZipFilePath, false);
        console.log('Found builtin zip file');
        await this.extractZip(builtinZipFilePath);
        await this.writeVersionAndConf(this.haystackVersion);
        this.installStatus = 'installed';
        console.log(`Installed from builtin zip file: ${builtinZipFilePath}`);
        return;
      } catch (error) {
        console.log('No builtin zip file found:', error);
      }

      // Step 3: Try downloading from primary URL
      this.installStatus = 'downloading';
      try {
        const primaryUrl = `${HAYSTACK_DOWNLOAD_URL}${this.haystackVersion}/${this.HAYSTACK_ZIP_FILE_NAME}`;
        console.log(`Downloading from primary URL: ${primaryUrl}`);
        await this.downloadFile(primaryUrl, downloadedZipPath);
        await this.extractZip(downloadedZipPath);
        await this.writeVersionAndConf(this.haystackVersion);
        this.installStatus = 'installed';
        console.log(`Downloaded from primary URL: ${primaryUrl}`);
        return;
      } catch (error) {
        console.log(`Failed to download from primary URL: ${error}`);
      }

      // Step 4: Try downloading from fallback URL
      try {
        const fallbackUrl = `${HAYSTACK_DOWNLOAD_URL_FALLBACK}${this.haystackVersion}/${this.HAYSTACK_ZIP_FILE_NAME}`;
        console.log(`Downloading from fallback URL: ${fallbackUrl}`);
        await this.downloadFile(fallbackUrl, downloadedZipPath);
        await this.extractZip(downloadedZipPath);
        await this.writeVersionAndConf(this.haystackVersion);
        this.installStatus = 'installed';
        console.log(`Downloaded from fallback URL: ${fallbackUrl}`);
        return;
      } catch (error) {
        console.log(`Failed to download from fallback URL: ${error}`);
        this.installStatus = 'error';
      }
    } catch (error) {
      console.error(`Installation failed: ${error}`);
      this.installStatus = 'error';
    }
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    let err: Error | undefined;
    for (let i = 0; i < 3; i++) {
      try {
        // Check if the file already exists
        await this.downloadFileWithNoRetry(url, destination);
        return;
      } catch (error) {
        err = error as Error;
      }
      // delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }

    throw new Error(`Failed to download file after 3 attempts: ${url}, err: ${err}`);
  }

  private downloadFileWithNoRetry(url: string, destination: string): Promise<void> {
    this._downloadProgress = {
      url,
      totalSize: 0,
      downloadedSize: 0,
      percent: 0,
    };
    this.emit('download-progress', this._downloadProgress);

    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destination);

      client
        .get(url, (response: http.IncomingMessage) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            file.close();
            // Handle redirects
            fs.unlink(destination, () => {
              this.downloadFile(response.headers.location!, destination)
                .then(resolve)
                .catch(reject);
            });
            return;
          }

          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(destination, () => {});
            reject(new Error(`Failed to download, status code: ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          console.log(`Total size: ${totalSize} bytes`);
          let downloadedSize = 0;
          let lastReportedPercent = 0;

          const percent = 0;
          this._downloadProgress = {
            url,
            totalSize,
            downloadedSize,
            percent,
          };
          this.emit('download-progress', this._downloadProgress);

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;

            // Report progress at most every 5% to avoid excessive events
            if (totalSize > 0) {
              const percent = Math.floor((downloadedSize / totalSize) * 100);
              this._downloadProgress = {
                url,
                totalSize,
                downloadedSize,
                percent,
              };
            }

            if (
              this._downloadProgress.percent >= lastReportedPercent + 5 ||
              this._downloadProgress.percent === 100
            ) {
              // Emit download progress event
              this.emit('download-progress', this._downloadProgress);
              lastReportedPercent = this._downloadProgress.percent;
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            this._downloadProgress = {
              url,
              totalSize,
              downloadedSize,
              percent: 100,
            };
            // Ensure we emit 100% at the end
            this.emit('download-progress', this._downloadProgress);
            resolve();
          });
        })
        .on('error', (err: Error) => {
          file.close();
          fs.unlink(destination, () => {});
          this.emit('error', {
            message: `Download failed: ${err.message}`,
            error: err,
          });
          reject(err);
        });

      file.on('error', (err: Error) => {
        file.close();
        fs.unlink(destination, () => {});
        this.emit('error', {
          message: `File write error: ${err.message}`,
          error: err,
        });
        reject(err);
      });
    });
  }

  private async checkExistingZip(zipFilePath: string, deleteIfSmall = false): Promise<void> {
    try {
      // Check if file exists
      await fs.promises.access(zipFilePath, fs.constants.F_OK);

      // Check file size
      const stats = await fs.promises.stat(zipFilePath);
      const minSizeBytes = 1024 * 1024; // 1MB in bytes

      if (stats.size < minSizeBytes) {
        if (deleteIfSmall) {
          await fs.promises.unlink(zipFilePath);
          console.log(`Deleted small zip file: ${zipFilePath}`);
        }

        throw new Error(
          `Zip file exists but is too small (${stats.size} bytes, minimum: ${minSizeBytes} bytes)`,
        );
      }

      console.log(`Verified zip file: ${zipFilePath}`);
    } catch (error) {
      if (error instanceof Error) {
        throw error; // Re-throw existing errors
      } else {
        throw new Error(`Zip file does not exist or cannot be accessed: ${zipFilePath}`);
      }
    }
  }

  private extractZip(zipFilePath: string): Promise<void> {
    // Use a zip extraction method compatible with your environment
    const zip = new AdmZip(zipFilePath);

    console.log(`Extracting zip file: ${zipFilePath}`);
    this.installStatus = 'extracting';
    return new Promise((resolve, reject) => {
      try {
        zip.extractAllTo(this.binDir, true);

        // Make the executable file runnable on non-Windows platforms
        if (platform() !== 'windows') {
          fs.chmodSync(this.coreFilePath, 0o755);
        }

        console.log(`Extracted zip file: ${zipFilePath}`);
        resolve();
      } catch (error) {
        console.log(`Extraction failed: ${error}`);
        reject(error);
      }
    });
  }

  private async writeVersionAndConf(version: string): Promise<void> {
    const versionFilePath = path.join(this.binDir, 'version.txt');
    await fs.promises.writeFile(versionFilePath, version);

    const confFilePath = path.join(this.binDir, 'config.yaml');
    const configContent = defaultHaystackConfig(this.context);
    await fs.promises.writeFile(confFilePath, YAML.dump(configContent));
  }

  private async checkIsCompatibleVersion(): Promise<void> {
    try {
      const version = await fs.promises.readFile(path.join(this.binDir, 'version.txt'), 'utf8');
      if (this.isVersionCompatible(version)) {
        return;
      }
      await fs.promises.unlink(this.coreFilePath);
      this.installStatus = 'not-installed';
      console.log('The installed Haystack is not compatible.');
    } catch (error) {
      console.error(`Failed to read version file: ${error}`);
    }

    // shutdown the Haystack server and try to unlink the core file again
    await this.shutdown();

    try {
      await fs.promises.unlink(this.coreFilePath);
      this.installStatus = 'not-installed';
    } catch (error) {
      console.error(`Failed to unlink Haystack core file: ${error}`);
    }
  }

  private async shutdown(): Promise<void> {
    try {
      console.log('Shutting down Haystack server...');
      this._axios.post('/api/v1/server/stop');
      // TODO: remove this call before next release
      this._axios.post(
        `${getHaystackHost()}:${this.useLocalServer ? LOCAL_PORT : GLOBAL_PORT}/api/v1/server/stop`,
        undefined,
        {
          socketPath: undefined,
        },
      );
      await this.waitingForShutdown();
      this.status = 'initializing';
      console.log('Haystack server stopped for upgrade.');
    } catch (error) {
      console.log('Shutdown Haystack server failed:', error);
    }
  }

  private async waitingForShutdown(): Promise<void> {
    const start = Date.now();
    for (;;) {
      const elapsedSeconds = (Date.now() - start) / 1000;
      if (elapsedSeconds > 20) {
        console.log('Haystack server shutdown timeout.');
        return;
      }

      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this._axios.get('/api/v1/server/status');
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return;
      }
    }
  }

  private async start(): Promise<void> {
    // Check if Haystack is running
    if (await this.isRunning()) {
      console.log('Haystack is already running.');
      this.status = 'running';
      return;
    }

    if (this._startRetry > 10) {
      this._startRetry = 0;
      console.error('Haystack server start failed.');
      this.status = 'error';
      return;
    }
    this.emit('starting', this._startRetry);
    this.startServer();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await this.isRunning()) {
      this.status = 'running';
      console.log('Haystack server started.');
      return;
    }

    setTimeout(() => {
      this._startRetry += 1;
      this.start();
    }, 3000);
  }

  private async isRunning(): Promise<boolean> {
    // Check if Haystack is running
    try {
      const response = await this._axios.get('/health');
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      console.error(`Haystack server is not running: ${error}`);
    }

    return false;
  }

  public startServer(): boolean {
    // run this.coreFilePath server start to start the server
    try {
      const command = `"${this.coreFilePath}" server start`;
      console.log(`Try starting Haystack server '${command}' (retry: ${this._startRetry})...`);
      const child = exec(command);
      child.stdout?.on('data', (data) => {
        console.log(`Haystack stdout: ${data}`);
      });
      child.stderr?.on('data', (data) => {
        console.error(`Haystack stderr: ${data}`);
      });
      child.on('error', (error) => {
        console.error(`Haystack start command failed: ${error}`);
      });
      child.on('exit', (code) => {
        console.error(`Haystack start command exited with code: ${code}`);
      });
      console.log('Haystack start command executed successfully');
      return true;
    } catch (error) {
      console.error(`Failed to start Haystack: ${error}`);
    }

    return false;
  }

  private isVersionCompatible(version: string): boolean {
    // Remove 'v' prefix if exists
    const currentVersion = version.replace('v', '');
    const requiredVersion = this.haystackVersion.replace('v', '');

    const currentParts = currentVersion.split('.').map(Number);
    const requiredParts = requiredVersion.split('.').map(Number);

    // Compare major, minor, and patch versions
    for (let i = 0; i < 3; i++) {
      if (currentParts[i] > requiredParts[i]) {
        return true;
      }
      if (currentParts[i] < requiredParts[i]) {
        return false;
      }
    }
    return true; // Versions are equal
  }

  /**
   * Subscribe to Haystack events.
   * @param event The event type to subscribe to
   * @param listener The callback function to be called when the event is emitted
   * @returns The Haystack instance for chaining
   */
  public on(event: HaystackEvent, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Subscribe to Haystack events for one-time execution.
   * @param event The event type to subscribe to
   * @param listener The callback function to be called when the event is emitted
   * @returns The Haystack instance for chaining
   */
  public once(event: HaystackEvent, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  /**
   * Unsubscribe from Haystack events.
   * @param event The event type to unsubscribe from
   * @param listener The callback function to be removed
   * @returns The Haystack instance for chaining
   */
  public off(event: HaystackEvent, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  /**
   * Remove all listeners for an event, or all events.
   * @param event Optional. The event to remove listeners for. If not provided, all listeners are removed.
   * @returns The Haystack instance for chaining
   */
  public removeAllListeners(event?: HaystackEvent): this {
    return super.removeAllListeners(event);
  }
}
