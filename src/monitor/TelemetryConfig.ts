export interface TelemetryConfig {
  // The Application Insights connection string in Azure portal.
  connectionString?: string;
  // Whether telemetry is enabled
  enabled: boolean;
  // Whether to enable verbose logging for development
  verboseLogging?: boolean;
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  connectionString:
    process.env.HAYSTACK_TELEMETRY_CONNECTION_STRING ||
    'InstrumentationKey=edec661b-b02c-48aa-955c-8fe4cd0f13ea;IngestionEndpoint=https://japaneast-1.in.applicationinsights.azure.com/;LiveEndpoint=https://japaneast.livediagnostics.monitor.azure.com/;ApplicationId=bf7c0e09-0c59-4b55-a2c8-5bc4a3f89fbe',
  enabled: true,
  verboseLogging: false,
};
