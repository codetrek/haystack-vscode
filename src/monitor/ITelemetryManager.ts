import * as vscode from 'vscode';
import { TelemetryConfig } from './TelemetryConfig';

export interface ITelemetryManager {
  // initialize telemetry manager with context and configuration
  initialize(context: vscode.ExtensionContext, config?: Partial<TelemetryConfig>): void;

  // report an usage event
  logUsage(
    eventName: string,
    properties?: Record<string, string | number | boolean>,
    measurements?: Record<string, number>,
  ): void;

  // report an error event
  logError(
    eventName: string,
    error: Error,
    properties?: Record<string, string | number | boolean>,
  ): void;

  // report a performance event
  logPerformance(
    eventName: string,
    duration: number,
    properties?: Record<string, string | number | boolean>,
  ): void;

  // check if telemetry is enabled
  isEnabled(): boolean;

  // dispose
  dispose(): void;
}
