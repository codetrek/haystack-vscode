import { TelemetryManager } from './TelemetryManager';
import { TELEMETRY_CONSTANTS } from './TelemetryConstant';

/**
 * Telemetry events for an operation
 */
export interface TelemetryEvents {
  usage: string;
  performance: string;
  failed: string;
  fisrt_result?: string; // Optional for first result events
}

/**
 * A performance measurement tracker that automatically manages start/end timing
 * and provides aspect-oriented telemetry capabilities.
 */
export class TelemetryTracker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static instance: any = undefined;

  private measurements: Map<string, number> = new Map();
  private telemetryManager: TelemetryManager;

  private constructor() {
    this.telemetryManager = TelemetryManager.getInstance();
  }

  public static getInstance(): TelemetryTracker {
    if (!TelemetryTracker.instance) {
      TelemetryTracker.instance = new TelemetryTracker();
    }
    return TelemetryTracker.instance;
  }

  /**
   * Start measuring performance for a given key
   * @param key Unique identifier for the measurement
   */
  measureStart(key: string): void {
    this.measurements.set(key, performance.now());
  }

  /**
   * End measurement and automatically log performance
   * @param key Unique identifier for the measurement
   * @param eventName The telemetry event name to log
   * @param metadata Additional metadata to include
   */
  measureEnd(
    key: string,
    eventName: string,
    metadata?: Record<string, string | number | boolean>,
  ): number {
    const startTime = this.measurements.get(key);
    if (startTime === undefined) {
      console.warn(`TelemetryTracker: No start measurement found for key "${key}"`);
      return -1;
    }

    const duration = performance.now() - startTime;
    this.measurements.delete(key);

    // Only log performance if it's not an UNKNOWN event
    if (eventName !== TELEMETRY_CONSTANTS.UNKNOWN) {
      this.telemetryManager.logPerformance(eventName, duration, metadata);
    }

    return duration;
  }

  /**
   * Get elapsed time without ending the measurement
   * @param key Unique identifier for the measurement
   */
  getElapsed(key: string): number {
    const startTime = this.measurements.get(key);
    if (startTime === undefined) {
      return -1;
    }
    return performance.now() - startTime;
  }

  /**
   * Log usage event
   * @param eventName The telemetry event name
   * @param metadata Additional metadata to include
   */
  logUsage(eventName: string, metadata?: Record<string, string | number | boolean>): void {
    if (eventName !== TELEMETRY_CONSTANTS.UNKNOWN) {
      this.telemetryManager.logUsage(eventName, metadata);
    }
  }

  /**
   * Log error event
   * @param eventName The telemetry event name
   * @param error The error that occurred
   * @param metadata Additional metadata to include
   */
  logError(
    eventName: string,
    error: Error,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    if (eventName !== TELEMETRY_CONSTANTS.UNKNOWN) {
      this.telemetryManager.logError(eventName, error, metadata);
    }
  }

  /**
   * Log performance event
   * @param eventName The telemetry event name
   * @param duration Duration in milliseconds
   * @param metadata Additional metadata to include
   */
  logPerformance(
    eventName: string,
    duration: number,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    if (eventName !== TELEMETRY_CONSTANTS.UNKNOWN) {
      this.telemetryManager.logPerformance(eventName, duration, metadata);
    }
  }

  /**
   * Clear all active measurements (useful for cleanup)
   */
  clear(): void {
    this.measurements.clear();
  }
}

/**
 * Telemetry operation context for managing related events
 */
export class TelemetryOperation {
  private tracker: TelemetryTracker;
  private operationKey: string;
  private events: TelemetryEvents;
  private metadata: Record<string, string | number | boolean>;

  constructor(
    operationKey: string,
    events: TelemetryEvents,
    metadata: Record<string, string | number | boolean> = {},
  ) {
    this.tracker = TelemetryTracker.getInstance();
    this.operationKey = operationKey + `-${performance.now()}`; // Unique key with timestamp
    this.events = events;
    this.metadata = metadata;
  }

  /**
   * Start the operation and log usage event
   */
  start(): void {
    if (this.events.usage === TELEMETRY_CONSTANTS.UNKNOWN) {
      return;
    }
    this.tracker.measureStart(this.operationKey);
    this.tracker.logUsage(this.events.usage, this.metadata);
  }

  /**
   * End the operation and log performance
   */
  end(additionalMetadata?: Record<string, string | number | boolean>): number {
    const finalMetadata = { ...this.metadata, ...additionalMetadata };
    return this.tracker.measureEnd(this.operationKey, this.events.performance, finalMetadata);
  }

  /**
   * End the operation with an error
   */
  error(error: Error, additionalMetadata?: Record<string, string | number | boolean>): void {
    const duration = this.tracker.getElapsed(this.operationKey);
    const finalMetadata = {
      ...this.metadata,
      ...additionalMetadata,
    };
    if (duration >= 0) {
      finalMetadata.duration = duration;
    }
    this.tracker.logError(this.events.failed, error, finalMetadata);

    // Clean up the measurement
    this.tracker.measureEnd(this.operationKey, TELEMETRY_CONSTANTS.UNKNOWN);
  }

  /**
   * Log a milestone within the operation
   */
  milestone(additionalMetadata?: Record<string, string | number | boolean>): void {
    if (
      this.events.fisrt_result === undefined ||
      this.events.fisrt_result === TELEMETRY_CONSTANTS.UNKNOWN
    ) {
      return;
    }
    const elapsed = this.tracker.getElapsed(this.operationKey);

    // Check if measurement is valid (getElapsed returns -1 for invalid keys)
    if (elapsed < 0) {
      console.warn(
        `TelemetryTracker: Invalid elapsed time for milestone in operation "${this.operationKey}"`,
      );
      return;
    }

    const finalMetadata = {
      ...this.metadata,
      ...additionalMetadata,
    };
    this.tracker.logPerformance(this.events.fisrt_result, elapsed, finalMetadata);
  }

  /**
   * Get current elapsed time
   */
  getElapsed(): number {
    return this.tracker.getElapsed(this.operationKey);
  }
}

/**
 * Decorator for automatic telemetry tracking
 */
export function withTelemetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  getOperationConfig: (...args: Parameters<T>) => {
    key: string;
    events: TelemetryEvents;
    metadata?: Record<string, string | number | boolean>;
  },
): T {
  return (async (...args: Parameters<T>) => {
    const config = getOperationConfig(...args);
    const operation = new TelemetryOperation(config.key, config.events, config.metadata);

    try {
      operation.start();
      const result = await fn(...args);
      operation.end();
      return result;
    } catch (error) {
      operation.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }) as T;
}

/**
 * Helper function to create telemetry events based on source
 */
export function getTelemetryEvents(baseEventName: string, source: string): TelemetryEvents {
  if (source === TELEMETRY_CONSTANTS.UNKNOWN) {
    return {
      usage: TELEMETRY_CONSTANTS.UNKNOWN,
      performance: TELEMETRY_CONSTANTS.UNKNOWN,
      failed: TELEMETRY_CONSTANTS.UNKNOWN,
      fisrt_result: TELEMETRY_CONSTANTS.UNKNOWN,
    };
  }

  return {
    usage: (TELEMETRY_CONSTANTS as Record<string, unknown>)[`${baseEventName}_${source}`] as string,
    performance: (TELEMETRY_CONSTANTS as Record<string, unknown>)[
      `${baseEventName}_${source}_PERFORMANCE`
    ] as string,
    failed: (TELEMETRY_CONSTANTS as Record<string, unknown>)[
      `${baseEventName}_${source}_FAILED`
    ] as string,
    fisrt_result: (TELEMETRY_CONSTANTS as Record<string, unknown>)[
      `${baseEventName}_${source}_FIRST_RESULT`
    ] as string | undefined,
  };
}
