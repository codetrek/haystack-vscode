import * as vscode from 'vscode';
import { HaystackProvider } from '../../core/HaystackProvider';
import { canonicalizePath } from '../utils';

export class SearchHandlers {
  private abortController: AbortController | null = null;

  constructor(private readonly haystackProvider: HaystackProvider) {
  }
  async handleSearch(webview: vscode.Webview, query: string, options: {
    caseSensitive: boolean;
    include: string;
    exclude: string;
    maxResults?: number;
    maxResultsPerFile?: number;
    workspaceRoot?: string;
  }) {
    let currentAbortController: AbortController | null = null; 
    let webviewPostMessageSentForCompletion = false;
    let globalResultsCount = 0;
    let globallyTruncated = false;

    try {
      this.cancelSearch(webview); 

      this.abortController = new AbortController();
      currentAbortController = this.abortController;

      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const maxResults = options.maxResults || config.get<number>('maxResults', 1000);
      const maxResultsPerFile = options.maxResultsPerFile || config.get<number>('maxResultsPerFile', 100);

      // Get workspace to search
      let workspacesToSearch: string[];
      
      if (options.workspaceRoot) {
        workspacesToSearch = [canonicalizePath(options.workspaceRoot)];
      } else {
        // Default to all workspaces if no specific one is provided
        // Fetch directly from the provider to get the latest order
        workspacesToSearch = this.haystackProvider.getWorkspaceRoots(); 
      }
      // Filter out any potentially empty strings and then deduplicate
      workspacesToSearch = [...new Set(workspacesToSearch.filter(p => p))];

      // Send initial message to indicate search has started
      webview.postMessage({
        type: 'searchStarted',
        query: query,
        workspaces: workspacesToSearch.map(ws => {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ws));
          const name = workspaceFolder?.name || ws.split(/[/\\]/).pop() || ws;
          return {
            path: ws,
            name: name
          };
        })
      });

      await vscode.commands.executeCommand('setContext', 'haystackSearching', true);

      const totalWorkspacesToSearch = workspacesToSearch.length;
      let completedSearchCount = 0;

      if (totalWorkspacesToSearch === 0) {
        if (!webviewPostMessageSentForCompletion) {
          webview.postMessage({
            type: 'searchResultStream',
            truncated: false, // No search, so not truncated
            isDone: true
          });
          webviewPostMessageSentForCompletion = true;
        }
        if (this.abortController === currentAbortController) {
          this.abortController = null;
        }
        vscode.commands.executeCommand('setContext', 'haystackSearching', false);
        return;
      }

      for (const workspaceRoot of workspacesToSearch) {
        if (currentAbortController!.signal.aborted) { 
          console.log(`Haystack: Search operation cancelled/truncated before starting search for workspace ${workspaceRoot}`);
          completedSearchCount++;
          if (completedSearchCount >= totalWorkspacesToSearch) {
            if (!webviewPostMessageSentForCompletion) { 
                webview.postMessage({ type: 'searchResultStream', truncated: globallyTruncated, isDone: true });
                webviewPostMessageSentForCompletion = true;
                if (this.abortController === currentAbortController) {
                    this.abortController = null;
                }
                vscode.commands.executeCommand('setContext', 'haystackSearching', false);
            }
          }
          continue; 
        }
        
        try {
          console.log(`Haystack: Searching in workspace ${workspaceRoot}`);
          
          await this.haystackProvider.searchStream(
            query,
            {
              workspaceRoot: workspaceRoot,
              caseSensitive: options.caseSensitive,
              include: options.include,
              exclude: options.exclude,
              maxResults: maxResults,
              maxResultsPerFile: maxResultsPerFile
            },
            (result, isDone) => {
              // if aborted, only process 'isDone' to complete the count and send final message
              if (currentAbortController!.signal.aborted && !isDone) { 
                return;
              }
              
              if (isDone) {
                completedSearchCount++;
                const allSearchesCompleted = (completedSearchCount >= totalWorkspacesToSearch);
                
                if (allSearchesCompleted) {
                  if (!webviewPostMessageSentForCompletion) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspaceRoot));
                    const name = workspaceFolder?.name || workspaceRoot.split(/[/\\]/).pop() || workspaceRoot;
                    webview.postMessage({
                      type: 'searchResultStream',
                      workspaceRoot: workspaceRoot, 
                      workspaceName: name,
                      truncated: (result.truncate || false) || globallyTruncated,
                      isDone: true
                    });
                    webviewPostMessageSentForCompletion = true;
                  }
                  if (this.abortController === currentAbortController) {
                    this.abortController = null;
                  }
                  vscode.commands.executeCommand('setContext', 'haystackSearching', false);
                }
                return;
              }

              if (result.file && result.lines && result.lines.length > 0) {
                if (globallyTruncated) { // If already globally truncated, ignore new results
                    return;
                }
                let linesToSend = result.lines;
                let currentResultTruncatedByGlobalLimit = false;

                if (globalResultsCount + result.lines.length >= maxResults) {
                    const remainingSlots = maxResults - globalResultsCount;
                    if (remainingSlots <= 0) { // No more slots
                        globallyTruncated = true;
                        if (!currentAbortController!.signal.aborted) {
                            currentAbortController!.abort(); // Abort all further processing
                        }
                        return; // Don't send this result
                    }
                    linesToSend = result.lines.slice(0, remainingSlots);
                    globallyTruncated = true; // Mark as globally truncated
                    currentResultTruncatedByGlobalLimit = true; // This specific result chunk was cut
                }

                globalResultsCount += linesToSend.length;
                
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspaceRoot));
                const name = workspaceFolder?.name || workspaceRoot.split(/[/\\]/).pop() || workspaceRoot;
                webview.postMessage({
                  type: 'searchResultStream',
                  workspaceRoot: workspaceRoot,
                  workspaceName: name,
                  result: {
                    ...result,
                    lines: linesToSend,
                    truncate: result.truncate || currentResultTruncatedByGlobalLimit
                  },
                  isDone: false
                });

                if (globallyTruncated && !currentAbortController!.signal.aborted) {
                    currentAbortController!.abort(); // Abort all further processing
                }
              }
            },
            currentAbortController!.signal 
          );
        } catch (error) {
          console.error(`Error searching workspace ${workspaceRoot}: ${error}`);
          completedSearchCount++; 
          if (completedSearchCount >= totalWorkspacesToSearch) {
            if (!webviewPostMessageSentForCompletion) {
                webview.postMessage({ type: 'searchResultStream', truncated: globallyTruncated, isDone: true });
                webviewPostMessageSentForCompletion = true;
            }
            if (this.abortController === currentAbortController) {
                this.abortController = null;
            }
            vscode.commands.executeCommand('setContext', 'haystackSearching', false);
          }
        }
      }

    } catch (error) {
      console.log(`Search error: ${error}`);
      if (!webviewPostMessageSentForCompletion) {
        webview.postMessage({ type: 'searchResultStream', truncated: globallyTruncated, isDone: true });
        // webviewPostMessageSentForCompletion = true; // Not strictly needed as this is the end of the try-catch
      }
      // cancelSearch handles abortController nullification and context setting.
      // If currentAbortController is this.abortController, cancelSearch will handle it.
      // If they are different (e.g. a new search started before this one errored out),
      // currentAbortController should still be aborted if it wasn't already.
      if (currentAbortController && this.abortController === currentAbortController && !currentAbortController.signal.aborted) {
        currentAbortController.abort();
      }
      // Ensure cancelSearch is called to properly clean up the class-level state if it matches current operation
      this.cancelSearch(webview); 
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
      // Ensure context is reset when a search is cancelled
      vscode.commands.executeCommand('setContext', 'haystackSearching', false);
    }
  }

  async handleOpenFile(file: string, line: number, workspaceRoot: string, start?: number, end?: number) {
    try {
      if (!workspaceRoot) {
        throw new Error('No workspace root provided for the file');
      }

      // 'file' is the relative path, 'workspaceRoot' is the absolute path to the workspace.
      // Construct the full path.
      const fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), file).fsPath;

      const uri = vscode.Uri.file(fullPath);
      // Check if the file is already open in an editor
      let document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === uri.fsPath);

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

  // Update the workspace roots when the DOM is loaded
  handleDomLoaded() {
    console.log('WebView DOM has been loaded');
    // Update the workspaceRoots in case they've changed
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
