export interface TelemetryConfig {
  // The Application Insights connection string in Azure portal.
  connectionString?: string;
  // Whether telemetry is enabled
  enabled: boolean;
  // Whether to enable verbose logging for development
  verboseLogging?: boolean;
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  connectionString: process.env.HAYSTACK_TELEMETRY_CONNECTION_STRING,
  enabled: true,
  verboseLogging: false,
};
