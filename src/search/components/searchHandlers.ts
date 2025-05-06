import * as vscode from 'vscode';
import { HaystackProvider } from '../../core/HaystackProvider';

export class SearchHandlers {
  private abortController: AbortController | null = null;
  private workspaceRoot: string;

  constructor(private readonly haystackProvider: HaystackProvider) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';
  }

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
      if (!this.workspaceRoot) {
        throw new Error('No workspace folder found');
      }

      const fullPath = file.startsWith(this.workspaceRoot)
        ? file
        : vscode.Uri.joinPath(vscode.Uri.file(this.workspaceRoot), file).fsPath;

      const uri = vscode.Uri.file(fullPath);
      let document: any;
      vscode.workspace.textDocuments.forEach((doc) => {
        if (doc.uri.fsPath === uri.fsPath) {
          // If the document is already open, we can just reveal it
          document = doc;
          return;
        }
      });

      if (!document) {
        // If the document is not open, we need to open it
        document = await vscode.workspace.openTextDocument(uri);
      }

      const editor = await vscode.window.showTextDocument(document);

      if (start !== undefined && end !== undefined) {
        const startPos = new vscode.Position(line - 1, start);
        const endPos = new vscode.Position(line - 1, end);
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
      } else {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
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
