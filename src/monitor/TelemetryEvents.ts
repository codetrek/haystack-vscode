export const TELEMETRY_EVENTS = {
  // Extension lifecycle events
  EXTENSION_ACTIVATED: 'haystack.extension.activated',
  EXTENSION_DEACTIVATED: 'haystack.extension.deactivated',

  // Search events
  SEARCH_EXECUTED: 'haystack.search.executed',
  SEARCH_SELECTED_TEXT: 'haystack.search.selectedText',
  WORKSPACE_SYNC: 'haystack.workspace.sync',

  // Performance events
  PERFORMANCE_SEARCH_DURATION: 'haystack.performance.searchDuration',
  PERFORMANCE_INDEX_BUILD: 'haystack.performance.indexBuild',
  PERFORMANCE_SERVER_START: 'haystack.performance.serverStart',

  // Command events
  COMMAND_OPEN_SETTINGS: 'haystack.command.openSettings',
  COMMAND_SYNC_WORKSPACE: 'haystack.command.syncWorkspace',

  // Error events
  ERROR_SEARCH_FAILED: 'haystack.error.searchFailed',
  ERROR_SERVER_CONNECTION: 'haystack.error.serverConnection',
  ERROR_WORKSPACE_SYNC: 'haystack.error.workspaceSync',
  ERROR_SERVER_START: 'haystack.error.serverStart',
  ERROR_INITIALIZATION: 'haystack.error.initialization',
} as const;
