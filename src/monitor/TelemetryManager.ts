import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { TelemetryConfig, DEFAULT_TELEMETRY_CONFIG } from './TelemetryConfig';
import { ITelemetryManager } from './ITelemetryManager';

// Singleton instance holder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let telemetryManagerInstance: any;

export class TelemetryManager implements ITelemetryManager {
  private reporter: TelemetryReporter | undefined;
  private config: TelemetryConfig = DEFAULT_TELEMETRY_CONFIG;
  private isDisposed = false;
  private context: vscode.ExtensionContext | undefined;

  // Private constructor to prevent external instantiation
  private constructor() {}

  /**
   * Get or create the singleton instance
   */
  public static getInstance(): TelemetryManager {
    if (!telemetryManagerInstance) {
      telemetryManagerInstance = new TelemetryManager();
    }
    return telemetryManagerInstance;
  }

  /**
   * Initialize the telemetry manager
   * Should be called once during extension activation
   */
  initialize(context: vscode.ExtensionContext, config?: Partial<TelemetryConfig>): void {
    if (telemetryManagerInstance?.reporter) {
      console.warn('[Haystack Telemetry] TelemetryManager already initialized');
      return;
    }

    this.context = context;
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
    this.initializeReporter();
  }

  logUsage(
    eventName: string,
    properties?: Record<string, string | number | boolean>,
    measurements?: Record<string, number>,
  ): void {
    if (this.isDisposed || !this.isEnabled()) {
      return;
    }

    try {
      const sanitizedProperties = this.sanitizeProperties(properties);
      this.log(`Usage event: ${eventName}`, { properties: sanitizedProperties, measurements });

      if (this.reporter) {
        this.reporter.sendTelemetryEvent(eventName, sanitizedProperties, measurements);
      }
    } catch (error) {
      this.log('Failed to log usage event:', error);
    }
  }

  logError(
    eventName: string,
    error: Error,
    properties?: Record<string, string | number | boolean>,
  ): void {
    if (this.isDisposed || !this.isEnabled()) {
      return;
    }

    try {
      const errorProperties = {
        ...this.sanitizeProperties(properties),
        errorMessage: error.message,
        errorName: error.name,
        // Don't include stack trace as it might contain sensitive paths
      };

      this.log(`Error event: ${eventName}`, { error: error.message, properties: errorProperties });

      if (this.reporter) {
        this.reporter.sendTelemetryErrorEvent(eventName, errorProperties);
      }
    } catch (err) {
      this.log('Failed to log error event:', err);
    }
  }

  logPerformance(
    eventName: string,
    duration: number,
    properties?: Record<string, string | number | boolean>,
  ): void {
    if (this.isDisposed || !this.isEnabled()) {
      return;
    }

    try {
      const sanitizedProperties = this.sanitizeProperties(properties);
      const measurements = { duration };

      this.log(`Performance event: ${eventName}`, { duration, properties: sanitizedProperties });

      if (this.reporter) {
        this.reporter.sendTelemetryEvent(eventName, sanitizedProperties, measurements);
      }
    } catch (error) {
      this.log('Failed to log performance event:', error);
    }
  }

  isEnabled(): boolean {
    return !this.isDisposed && this.isTelemetryEnabled();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.log('Disposing telemetry manager');
    this.isDisposed = true;

    if (this.reporter) {
      try {
        this.reporter.dispose();
      } catch (error) {
        this.log('Error disposing telemetry reporter:', error);
      }
      this.reporter = undefined;
    } // Clear the singleton instance
    telemetryManagerInstance = undefined;
  }

  private initializeReporter(): void {
    try {
      // Check if telemetry is enabled globally in VS Code and in extension settings
      if (!this.isTelemetryEnabled()) {
        this.log('Telemetry is disabled, skipping reporter initialization');
        return;
      }

      if (!this.config.connectionString) {
        this.log('No connection string provided, telemetry will not be sent');
        return;
      }

      // Create the telemetry reporter
      this.reporter = new TelemetryReporter(this.config.connectionString);
      this.log('Telemetry reporter initialized successfully');
    } catch (error) {
      this.log('Failed to initialize telemetry reporter:', error);
    }
  }

  private isTelemetryEnabled(): boolean {
    // Check VS Code global telemetry setting
    if (!vscode.env.isTelemetryEnabled) {
      return false;
    }

    // Check extension-specific telemetry setting
    const config = vscode.workspace.getConfiguration('haystack.telemetry');
    const extensionTelemetryEnabled = config.get<boolean>('enabled', true);

    return this.config.enabled && extensionTelemetryEnabled;
  }

  private isDevelopmentMode(): boolean {
    return (
      process.env.VSCODE_DEBUG_MODE === 'true' ||
      process.env.IS_DEV === 'true' ||
      this.context?.extensionMode === vscode.ExtensionMode.Development
    );
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.config.verboseLogging || this.isDevelopmentMode()) {
      console.log(`[Haystack Telemetry] ${message}`, ...args);
    }
  }

  private sanitizeProperties(
    properties?: Record<string, string | number | boolean>,
  ): Record<string, string> {
    if (!properties) return {};

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties)) {
      // Convert all values to strings and sanitize sensitive data
      if (value !== null && value !== undefined) {
        let stringValue = String(value);

        // Remove potential file paths or sensitive information
        stringValue = this.sanitizeSensitiveData(stringValue);

        sanitized[key] = stringValue;
      }
    }
    return sanitized;
  }

  private sanitizeSensitiveData(value: string): string {
    // Remove file paths (basic implementation)
    const pathRegex = /[A-Za-z]:\\[^\\/:*?"<>|\r\n]+\\[^\\/:*?"<>|\r\n]*/g;
    const unixPathRegex = /\/[^/\s]+(?:\/[^/\s]+)+/g;

    return value
      .replace(pathRegex, '[PATH_REMOVED]')
      .replace(unixPathRegex, '[PATH_REMOVED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REMOVED]');
  }
}
