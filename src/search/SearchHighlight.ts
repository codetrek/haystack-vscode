import * as vscode from 'vscode';
import { LineMatch } from '../types/search';

interface FileSearchResult {
  matches: LineMatch[];
  ranges: vscode.Range[];
}

export class SearchHighlightManager implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly searchResults = new Map<string, FileSearchResult>();

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      border: '2px solid',
      borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
      overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
  }

  /**
   * Update search results for a file
   * @param fileUri - Complete file URI (e.g., "file:///home/user/project/src/file.cs")
   * @param matches - Search matches for the file
   */
  updateSearchResult(fileUri: string, matches: LineMatch[]): void {
    if (matches.length === 0) {
      this.searchResults.delete(fileUri);
      // Clear any existing highlights for this file
      this.applyHighlightToFile(fileUri, []);
      return;
    }

    const ranges = matches.map((match) => this.convertToVSCodeRange(match));
    this.searchResults.set(fileUri, { matches, ranges });

    // Apply highlights to any currently visible editors for this file
    this.applyHighlightToFile(fileUri, ranges);
  }

  clearSearch(): void {
    // Clear all stored search results
    this.searchResults.clear();

    // Clear highlights from all visible editors
    vscode.window.visibleTextEditors.forEach((editor) => {
      editor.setDecorations(this.decorationType, []);
    });
  }

  onDocumentActivated(document: vscode.TextDocument): void {
    // Only process file:// documents
    if (document.uri.scheme !== 'file') {
      return;
    }

    const documentUri = document.uri.toString();
    const result = this.searchResults.get(documentUri);

    if (result) {
      console.log(
        `SearchHighlightManager: Applying highlight for activated document: ${documentUri}`,
      );
      this.applyHighlightToFile(documentUri, result.ranges);
    } else {
      // Clear any existing highlights for this document
      this.applyHighlightToFile(documentUri, []);
    }
  }

  private convertToVSCodeRange(match: LineMatch): vscode.Range {
    const lineNumber = match.line.line_number - 1; // VS Code uses 0-based indexing
    const matchArray = match.line.match;

    if (!matchArray || matchArray.length < 2) {
      // If no match positions, highlight the entire line
      return new vscode.Range(
        new vscode.Position(lineNumber, 0),
        new vscode.Position(lineNumber, match.line.content.length),
      );
    }

    const [startColumn, endColumn] = matchArray;

    return new vscode.Range(
      new vscode.Position(lineNumber, startColumn),
      new vscode.Position(lineNumber, endColumn),
    );
  }

  private applyHighlightToFile(fileUri: string, ranges: vscode.Range[]): void {
    // Find all visible editors for this file and apply highlights
    const targetEditors = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.toString() === fileUri,
    );

    if (targetEditors.length > 0) {
      console.log(
        `SearchHighlightManager: Applying ${ranges.length} highlights to ${targetEditors.length} editors for ${fileUri}`,
      );
      targetEditors.forEach((editor) => {
        editor.setDecorations(this.decorationType, ranges);
      });
    }
  }

  dispose(): void {
    this.clearSearch();
    this.decorationType.dispose();
  }
}
