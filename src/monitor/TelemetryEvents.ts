export const TELEMETRY_EVENTS = {
  // Extension lifecycle events
  EXTENSION_ACTIVATED: 'haystack.extension.activated',
  EXTENSION_DEACTIVATED: 'haystack.extension.deactivated',

  // Events name should be haystack.event.<subtype>.<event-name>
  // e.g. haystack.event.search.executed
  // Performances name should be haystack.performance.<subtype>.<event-name>
  // e.g. haystack.performance.search.executed
  // Search events
  SEARCH_EXECUTED: 'haystack.event.search.executed',
  SEARCH_EXECUTED_FAILED: 'haystack.error.search.failed',
  SEARCH_EXECUTED_PERFORMANCE: 'haystack.performance.search.executed',
  SEARCH_CANCELED: 'haystack.event.search.canceled',

  // Workspace events
  WORKSPACE_CREATION: 'haystack.event.workspace.creation',
  WORKSPACE_CREATION_PERFORMANCE: 'haystack.performance.workspace.creation',
  WORKSPACE_CREATION_FAILED: 'haystack.error.workspace.creation',
  WORKSPACE_SYNC: 'haystack.event.workspace.sync',
  WORKSPACE_SYNC_PERFORMANCE: 'haystack.performance.workspace.sync',
  WORKSPACE_SYNC_FAILED: 'haystack.error.workspace.sync',
} as const;
