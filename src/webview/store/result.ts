import { proxy, snapshot } from 'valtio';
import { derive } from 'derive-valtio';
import type { LineMatch } from '@/types/search';
import { normalizePath } from '../utils';
import type { SearchResultStream } from '@/message/webview';

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

export function resetResult() {
  result.status = 'idle';
  result.results = {};
  result.errorMessage = '';
  result.searchSummary = '';
}

export function setSearchLoading() {
  resetResult();
  result.status = 'loading';
  result.searchSummary = 'Searching...';
}

export function setSearchError(message: string) {
  resetResult();
  result.status = 'error';
  result.errorMessage = message;
}

export function setSearchDone(isTruncated = false) {
  result.status = 'done';
  if (resultCounter.matchedLines === 0) {
    result.searchSummary = 'No results found';
    return;
  }
  result.searchSummary = `{matchedLines} results in {totalFiles} files`;
  if (isTruncated) {
    result.searchSummary += ` (Results truncated, showing partial matches)`;
  }
}

export function setSearchStream(stream: SearchResultStream) {
  result.status = 'loading';
  const normalizedWorkSpace = normalizePath(stream.workspaceRoot);
  const normalizedFile = normalizePath(stream.result.file);

  // initialize the workspace and file if not exists
  result.results[normalizedWorkSpace] = result.results[normalizedWorkSpace] || {
    workspaceName: stream.workspaceName,
    workSpaceRoot: stream.workspaceRoot,
    count: 0,
    files: {},
  };
  result.results[normalizedWorkSpace].files[normalizedFile] = result.results[normalizedWorkSpace]
    .files[normalizedFile] || {
    filePath: stream.result.file,
    count: 0,
    results: [],
  };

  // add the result to the workspace and file
  result.results[normalizedWorkSpace].files[normalizedFile].results.push(
    ...(stream.result.lines || []),
  );
  result.results[normalizedWorkSpace].files[normalizedFile].truncated =
    stream.result.truncate || false;

  // update the count for the workspace and file
  const matchedCount = result.results[normalizedWorkSpace].files[normalizedFile].results.length;
  result.results[normalizedWorkSpace].count += matchedCount;
  result.results[normalizedWorkSpace].files[normalizedFile].count = matchedCount;
  // update the search summary
  result.searchSummary = `{matchedLines} results in {totalFiles} files (searching...)`;
}

export function setSearchCancelled() {
  result.status = 'cancelled';
  result.searchSummary = `{matchedLines} results in {totalFiles} files (cancelled)`;
}
