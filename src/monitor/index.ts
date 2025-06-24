import * as vscode from 'vscode';
import { ITelemetryManager } from './ITelemetryManager';
import { TelemetryManager } from './TelemetryManager';
import { TelemetryConfig } from './TelemetryConfig';

/**
 * Creates an appropriate telemetry manager based on the environment
 */
export function createTelemetryManager(
  context: vscode.ExtensionContext,
  config?: Partial<TelemetryConfig>,
): ITelemetryManager {
  const isDevelopmentMode = context.extensionMode === vscode.ExtensionMode.Development;
  const isDebugMode = process.env.VSCODE_DEBUG_MODE === 'true' || process.env.IS_DEV === 'true';
  const telemetryManager = TelemetryManager.getInstance();
  telemetryManager.initialize(context, {
    ...config,
    verboseLogging: isDevelopmentMode || isDebugMode,
  });
  return telemetryManager;
}
