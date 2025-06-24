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
    excludePattern: { '**/node_modules/**': true },
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
  return filePath.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
}

export function fuzzyMatchScore(pattern: string, text: string): number {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  let patternIdx = 0;
  let textIdx = 0;
  const matchPositions: number[] = [];

  while (patternIdx < patternLower.length && textIdx < textLower.length) {
    if (patternLower[patternIdx] === textLower[textIdx]) {
      matchPositions.push(textIdx);
      patternIdx++;
    }
    textIdx++;
  }

  if (patternIdx !== patternLower.length) return 0;

  const patternMatchScore = 1;

  const matchCoverageScore = pattern.length / text.length;

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < matchPositions.length; i++) {
    if (matchPositions[i] === matchPositions[i - 1] + 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  const streakScore = maxStreak / pattern.length;

  const span = matchPositions[matchPositions.length - 1] - matchPositions[0] + 1;
  const densityScore = pattern.length / span;

  const finalScore =
    patternMatchScore * 0.25 + matchCoverageScore * 0.25 + streakScore * 0.25 + densityScore * 0.25;

  return finalScore;
}
