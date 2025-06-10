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

export interface SearchContentRequest {
  workspace?: string;
  query: string;
  editor: EditorContext;
  case_sensitive?: boolean;
  filters?: SearchFilters;
  limit?: SearchLimit;
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
  symbol_parse: boolean;
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
