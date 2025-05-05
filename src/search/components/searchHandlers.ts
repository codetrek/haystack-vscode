import * as vscode from 'vscode';
import { HaystackProvider } from '../../core/HaystackProvider';
import { SearchContentResult, SearchContentRequest } from '../../types/search';

export class SearchHandlers {
  private abortController: AbortController | null = null;

  constructor(private readonly haystackProvider: HaystackProvider) {}

  async handleSearch(webview: vscode.Webview, query: string, options: {
    caseSensitive: boolean;
    include: string;
    exclude: string;
    maxResults?: number;
    maxResultsPerFile?: number;
  }) {
    try {
      // Cancel any ongoing search first
      this.cancelSearch();

      // Create a new abort controller for this search
      this.abortController = new AbortController();

      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const maxResults = options.maxResults || config.get<number>('maxResults', 1000);
      const maxResultsPerFile = options.maxResultsPerFile || config.get<number>('maxResultsPerFile', 100);

      // Send initial message to indicate search has started
      webview.postMessage({
        type: 'searchStarted',
        query: query
      });

      await vscode.commands.executeCommand('setContext', 'haystackSearching', true);
      await this.haystackProvider.searchStream(
        query,
        {
          caseSensitive: options.caseSensitive,
          include: options.include,
          exclude: options.exclude,
          maxResults: maxResults,
          maxResultsPerFile: maxResultsPerFile
        },
        (result, isDone) => {
          // Check for the completion marker
          if (isDone) {
            webview.postMessage({
              type: 'searchResultStream',
              truncated: result.truncate || false,
              isDone: true
            });
            this.abortController = null; // Clear the abort controller after completion
            vscode.commands.executeCommand('setContext', 'haystackSearching', false);
            return;
          }

          // Only send valid results (with a non-empty file path)
          if (result.file) {
            // Send each result to the webview as it arrives
            webview.postMessage({
              type: 'searchResultStream',
              result: result,
              isDone: false
            });
          }
        },
        this.abortController.signal
      );
    } catch (error) {
      console.log(`Search error: ${error}`);

      // Also send a search results message to properly close the search
      webview.postMessage({
        type: 'searchResultStream',
        truncated: false,
        isDone: true
      });
      this.abortController = null; // Clear the abort controller after completion
      vscode.commands.executeCommand('setContext', 'haystackSearching', false);
    }
  }

  cancelSearch(webview?: vscode.Webview) {
    if (this.abortController) {
      // If webview is provided, send confirmation that search was cancelled
      if (webview) {
        webview.postMessage({
          type: 'searchCancelled'
        });
      }

      this.abortController.abort();
      this.abortController = null;
    }
  }

  async handleOpenFile(file: string, line: number, start?: number, end?: number) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      const fullPath = file.startsWith(workspaceRoot)
        ? file
        : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), file).fsPath;

      const uri = vscode.Uri.file(fullPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      const position = new vscode.Position(line - 1, 0);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

      if (start !== undefined && end !== undefined) {
        const startPos = new vscode.Position(line - 1, start);
        const endPos = new vscode.Position(line - 1, end);
        editor.selection = new vscode.Selection(startPos, endPos);
      } else {
        editor.selection = new vscode.Selection(position, position);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  handleFocusSearchInput(webview: vscode.Webview) {
    webview.postMessage({
      type: 'focusSearchInput'
    });
  }

  handleDomLoaded() {
    console.log('WebView DOM has been loaded');
  }

  handleVisibilityChange(webview: vscode.Webview, isVisible: boolean) {
    console.log(`Search view visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

    webview.postMessage({
      type: 'visibilityChanged',
      isVisible: isVisible
    });

    if (isVisible) {
      this.handleFocusSearchInput(webview);
    }
  }
}
