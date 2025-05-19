import * as vscode from 'vscode';

interface TextSearchResult {
  uri: vscode.Uri;
  range: vscode.Range;
  preview: {
    text: string;
    matches: vscode.Range[];
  };
}

interface TextSearchOptions {
  includePattern: { [key: string]: boolean };
  excludePattern: { [key: string]: boolean };
}

export function parseSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function formatSearchResults(results: TextSearchResult[]): TextSearchResult[] {
  return results;
}

export function getSearchOptions(): TextSearchOptions {
  return {
    includePattern: { '**/*': true },
    excludePattern: { '**/node_modules/**': true }
  };
}

/**
 * Canonicalizes a file path.
 * - Converts to lowercase.
 * - Replaces all backslashes with forward slashes.
 * - Removes trailing slashes.
 * @param filePath The path to canonicalize.
 * @returns The canonicalized path.
 */
export function canonicalizePath(filePath: string): string {
  if (!filePath) return '';
  return filePath
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}
