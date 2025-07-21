import type { Uri, Range } from 'vscode';

export interface TextSearchOptions {
  includePattern?: { [key: string]: boolean };
  excludePattern?: { [key: string]: boolean };
  maxResults?: number;
  maxResultsPerFile?: number;
  includeDeclaration?: boolean;
}

export interface TextSearchResult {
  uri: Uri;
  range: Range;
  preview: {
    text: string;
    matches: Range[];
  };
}

export interface SearchLimit {
  max_results?: number;
  max_results_per_file?: number;
}

export interface SearchFilters {
  path?: string;
  include?: string;
  exclude?: string;
}

export interface EditorContext {
  open_files?: string[];
  active_file?: string;
}

export interface UnsavedFile {
  path: string;
  content: string;
}

export interface SearchContentRequest {
  workspace?: string;
  query: string;
  editor: EditorContext;
  case_sensitive?: boolean;
  whole_word?: boolean;
  filters?: SearchFilters;
  limit?: SearchLimit;
  before_after?: number;
  unsaved_files?: UnsavedFile[];
  unsaved_files_only?: boolean;
}

export interface SearchContentLine {
  line_number: number;
  content: string;
  match?: number[];
}

export interface LineMatch {
  before?: SearchContentLine[];
  line: SearchContentLine;
  after?: SearchContentLine[];
}

export interface SearchContentResult {
  file: string;
  lines?: LineMatch[];
  truncate?: boolean;
}

export interface SearchContentResponse {
  code: number;
  message: string;
  data?: {
    results?: SearchContentResult[];
    truncate?: boolean;
  };
}

export interface SearchMessage {
  type:
    | 'search'
    | 'openFile'
    | 'focusSearchInput'
    | 'domLoaded'
    | 'visibilityChanged'
    | 'cancelSearch';
  query: string;
  options: {
    caseSensitive: boolean;
    wholeWord: boolean;
    include: string;
    exclude: string;
    maxResults?: number;
    maxResultsPerFile?: number;
  };
  file?: string;
  line?: number;
  start?: number;
  end?: number;
  isVisible?: boolean;
  workspaceRoot?: string;
}

export interface Exclude {
  use_git_ignore?: boolean;
  customized?: string[];
}

export interface Filters {
  exclude?: Exclude;
  include?: string[];
}

export interface CreateWorkspaceRequest {
  workspace: string;
  use_global_filters: boolean;
  filters?: Filters;
}

export interface UpdateWorkspaceRequest {
  workspace: string;
  use_global_filters: boolean;
  filters?: Filters;
}

export interface SymbolsFileMatch {
  path: string;
  line: number;
}

export interface SymbolContent {
  name: string;
  files: SymbolsFileMatch[];
}

export interface SymbolsContentResults {
  query: string;
  symbols: SymbolContent[];
}

export interface SearchSymbolsResponse {
  code: number;
  message: string;
  data?: SymbolsContentResults;
}

export interface SearchSymbolsRequest {
  workspace: string;
  query: string;
  fuzzy: boolean;
  limit?: SearchLimit;
}

export interface SearchFilesRequest {
  workspace: string;
  query: string;
  limit?: number;
}

export interface SearchFilesResult {
  query: string;
  results: string[];
}

export interface SearchFilesResponse {
  code: number;
  message: string;
  data?: SearchFilesResult;
}

/**
 * Base search options that are shared across workspaces (excluding special fields)
 */
export interface BaseSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  include?: string;
  exclude?: string;
  maxResults?: number;
  maxResultsPerFile?: number;
  beforeAfter?: number;
  path?: string;
  telemetrySource?: string;
}

/**
 * Standardized search options interface used across the application
 */
export interface SearchOptions extends BaseSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  include: string;
  exclude: string;
  workspaceRoot?: string;
}

/**
 * Search stream options with special fields for individual file searches
 */
export interface SearchStreamOptions extends BaseSearchOptions {
  workspaceRoot?: string;
  unsavedFiles?: UnsavedFile[];
  unsavedFilesOnly?: boolean;
}

/**
 * Search state for a specific workspace within a session
 */
export interface WorkspaceSearchState {
  isCompleted: boolean; // Whether the search has completed for this workspace
  acceptedFiles: Set<string>; // Files that were accepted by the upper layer
  fileTimestamps: Map<string, number>; // fileName -> timestamp of search that produced current result
  modifiedDuringSearch: Set<string>; // Files that were modified during search but not yet re-searched

  // Workspace-specific callback functions bound with state management logic
  // Note: These could theoretically be unified at session level with workspace parameter,
  // but keeping separate for now to avoid changing caller code structure
  onSearchResult: (result: SearchContentResult, searchTimestamp: number) => Promise<void>;
  onDone: (result: SearchContentResult) => Promise<void>;
}

/**
 * Search session that spans multiple workspaces
 */
export interface SearchSession {
  query: string;
  options: BaseSearchOptions; // Global search options shared across workspaces
  timestamp: number; // Session start time for identifying search instances
  workspaceStates: Map<string, WorkspaceSearchState>; // workspaceRoot -> state
}

/**
 * Legacy interface for backward compatibility
 * @deprecated Use SearchSession and WorkspaceSearchState instead
 */
export interface ActiveSearchState extends WorkspaceSearchState {
  query: string;
  options: SearchOptions;
  timestamp: number;
}
