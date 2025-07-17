export const TELEMETRY_CONSTANTS = {
  UNKNOWN: 'UNKNOWN',
  // Telemetry source types
  TELEMETRY_SOURCE_MANUAL: 'MANUAL',
  TELEMETRY_SOURCE_AI_TOOL: 'AI_TOOL',
  TELEMETRY_SOURCE_DOCS_CHANGED: 'DOCS_CHANGED',

  DEFAULT_FILE_SEARCH_MAX_RESULTS: 100,

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

  // Workspace events
  WORKSPACE_CREATION: 'haystack.event.workspace.creation',
  WORKSPACE_CREATION_PERFORMANCE: 'haystack.performance.workspace.creation',
  WORKSPACE_CREATION_FAILED: 'haystack.error.workspace.creation',
  WORKSPACE_SYNC: 'haystack.event.workspace.sync',
  WORKSPACE_SYNC_PERFORMANCE: 'haystack.performance.workspace.sync',
  WORKSPACE_SYNC_FAILED: 'haystack.error.workspace.sync',

  // File search events
  FILE_SEARCH_MANUAL: 'haystack.event.filesearch.manual',
  FILE_SEARCH_MANUAL_PERFORMANCE: 'haystack.performance.filesearch.manual',
  FILE_SEARCH_MANUAL_FAILED: 'haystack.error.filesearch.manual',
  FILE_SEARCH_AI_TOOL: 'haystack.event.filesearch.ai_tool',
  FILE_SEARCH_AI_TOOL_PERFORMANCE: 'haystack.performance.filesearch.ai_tool',
  FILE_SEARCH_AI_TOOL_FAILED: 'haystack.error.filesearch.ai_tool',

  // Stream search events
  STREAM_SEARCH_MANUAL: 'haystack.event.streamsearch.manual',
  STREAM_SEARCH_MANUAL_FIRST_RESULT: 'haystack.performance.streamsearch.manual.first_result',
  STREAM_SEARCH_MANUAL_PERFORMANCE: 'haystack.performance.streamsearch.manual.total',
  STREAM_SEARCH_MANUAL_FAILED: 'haystack.error.streamsearch.manual',
  STREAM_SEARCH_AI_TOOL: 'haystack.event.streamsearch.ai_tool',
  STREAM_SEARCH_AI_TOOL_FIRST_RESULT: 'haystack.performance.streamsearch.ai_tool.first_result',
  STREAM_SEARCH_AI_TOOL_PERFORMANCE: 'haystack.performance.streamsearch.ai_tool.total',
  STREAM_SEARCH_AI_TOOL_FAILED: 'haystack.error.streamsearch.ai_tool',
  STREAM_SEARCH_DOCS_CHANGED: 'haystack.event.streamsearch.docs_changed',
  STREAM_SEARCH_DOCS_CHANGED_FIRST_RESULT:
    'haystack.performance.streamsearch.docs_changed.first_result',
  STREAM_SEARCH_DOCS_CHANGED_PERFORMANCE: 'haystack.performance.streamsearch.docs_changed.total',
  STREAM_SEARCH_DOCS_CHANGED_FAILED: 'haystack.error.streamsearch.docs_changed',
} as const;
