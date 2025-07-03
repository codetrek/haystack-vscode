import { proxy, snapshot } from 'valtio';
import { derive } from 'derive-valtio';
import type { LineMatch } from '@/types/search';
import { normalizePath } from '../utils';
import type { UpdateResultData } from '@/message/webview';

export interface StructuredResult {
  [workspaceRoot: string]: {
    count: number; // Total matches in this workspace
    workspaceName: string;
    workSpaceRoot: string;
    files: {
      [filePath: string]: {
        filePath: string;
        count: number; // Matches in this file
        truncated?: boolean; // Whether the results are truncated
        results: LineMatch[]; // Array of results for this file
      };
    };
  };
}

export interface SearchResult {
  status: 'idle' | 'loading' | 'error' | 'done' | 'cancelled';
  results: StructuredResult;
  errorMessage: string;
  searchSummary: string;
  isTruncated: boolean;
}

/**
 * Most of the time, we should not directly use or update `result`.
 * Instead, we should use the action methods defined below to modify it,
 * and consume it using the `useResult` hook.
 */
export const result = proxy<SearchResult>({
  status: 'idle',
  results: {},
  errorMessage: '',
  searchSummary: '',
  isTruncated: false,
});

export const getResultSnpapshot = () => snapshot(result);

export const resultCounter = derive(
  {
    // how many unique files have matches
    totalFiles: (get) =>
      Object.values(get(result).results).reduce((count, workspace) => {
        return count + Object.keys(workspace.files).length;
      }, 0),
    // how many total matches across all files
    matchedLines: (get) =>
      Object.values(get(result).results).reduce((count, workspace) => {
        return count + workspace.count;
      }, 0),
  },
  {
    // we need to update the derived state synchronously at test time
    // but in production, we want it to be async so valtio can batch notify react to re-render
    sync: process.env.NODE_ENV === 'test',
  },
);

export const summary = derive({
  content: (get) => {
    const { searchSummary } = get(result);
    const { totalFiles, matchedLines } = get(resultCounter);
    return searchSummary
      .replace('{totalFiles}', totalFiles.toString())
      .replace('{matchedLines}', matchedLines.toString());
  },
});

export function isLoading() {
  return result.status === 'loading';
}
export function isError() {
  return result.status === 'error';
}
export function isSuccess() {
  return result.status === 'done';
}
export function isIdle() {
  return result.status === 'idle';
}
export function isCancelled() {
  return result.status === 'cancelled';
}

export function hasResults() {
  return Object.keys(result.results).length > 0;
}

function updateSearchSummary(newStatus?: SearchResult['status']) {
  // Update status if provided
  if (newStatus !== undefined) {
    result.status = newStatus;
  }

  // Calculate summary based on current status and data
  const { matchedLines } = resultCounter;

  switch (result.status) {
    case 'loading':
      if (matchedLines === 0) {
        result.searchSummary = 'Searching...';
      } else {
        result.searchSummary = `{matchedLines} results in {totalFiles} files (searching...)`;
      }
      break;
    case 'done':
      if (matchedLines === 0) {
        result.searchSummary = 'No results found';
      } else {
        result.searchSummary = `{matchedLines} results in {totalFiles} files`;
        if (result.isTruncated) {
          result.searchSummary += ` (Results truncated, showing partial matches)`;
        }
      }
      break;
    case 'cancelled':
      result.searchSummary = `{matchedLines} results in {totalFiles} files (cancelled)`;
      break;
    case 'error':
      // Error status doesn't modify summary
      break;
    case 'idle':
      result.searchSummary = '';
      break;
  }
}

export function resetResult() {
  result.status = 'idle';
  result.results = {};
  result.errorMessage = '';
  result.searchSummary = '';
  result.isTruncated = false;
}

export function setSearchLoading() {
  resetResult();
  updateSearchSummary('loading');
}

export function setSearchError(message: string) {
  resetResult();
  result.status = 'error';
  result.errorMessage = message;
}

export function setSearchDone(isTruncated = false) {
  result.isTruncated = isTruncated;
  updateSearchSummary('done');
}

export function setSearchStream(stream: UpdateResultData) {
  const normalizedWorkSpace = normalizePath(stream.workspaceRoot);
  const normalizedFile = normalizePath(stream.result.file);

  // initialize the workspace and file if not exists
  result.results[normalizedWorkSpace] = result.results[normalizedWorkSpace] || {
    workspaceName: stream.workspaceName,
    workSpaceRoot: stream.workspaceRoot,
    count: 0,
    files: {},
  };

  // Get the old count before updating, for proper count adjustment
  const oldFileCount = result.results[normalizedWorkSpace].files[normalizedFile]?.count || 0;

  result.results[normalizedWorkSpace].files[normalizedFile] = result.results[normalizedWorkSpace]
    .files[normalizedFile] || {
    filePath: stream.result.file,
    count: 0,
    results: [],
  };

  // Replace the results instead of appending
  result.results[normalizedWorkSpace].files[normalizedFile].results = stream.result.lines || [];
  result.results[normalizedWorkSpace].files[normalizedFile].truncated =
    stream.result.truncate || false;

  // Update the count: subtract old count, add new count
  const newFileCount = result.results[normalizedWorkSpace].files[normalizedFile].results.length;
  result.results[normalizedWorkSpace].count =
    result.results[normalizedWorkSpace].count - oldFileCount + newFileCount;
  result.results[normalizedWorkSpace].files[normalizedFile].count = newFileCount;

  // Update summary based on current status
  updateSearchSummary();
}

export function setSearchCancelled() {
  updateSearchSummary('cancelled');
}
