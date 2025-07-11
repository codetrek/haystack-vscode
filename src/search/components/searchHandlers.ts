import * as vscode from 'vscode';
import { HaystackProvider } from '../../core/HaystackProvider';
import { ExtensionMessagePipeline } from '@/message/extension';
import type { SearchOptions, SearchContentResult } from '../../types/search';
import { SearchHighlightManager } from '../SearchHighlight';
import { TelemetryManager } from '../../monitor/TelemetryManager';
import { TELEMETRY_EVENTS } from '../../monitor/TelemetryEvents';

interface FileResultInfo {
  resultCount: number;
}

export class SearchHandlers {
  private abortController: AbortController | null = null;
  // Track search session state
  private searchCompleted = false;
  private workspaceFiles = new Map<string, Map<string, FileResultInfo>>(); // workspace -> filename -> info

  constructor(
    private readonly haystackProvider: HaystackProvider,
    private readonly searchHighlightManager?: SearchHighlightManager,
  ) {}
  async handleSearch(msgPipeline: ExtensionMessagePipeline, query: string, options: SearchOptions) {
    let currentAbortController: AbortController | null = null;
    let webviewPostMessageSentForCompletion = false;
    let globalResultsCount = 0;
    let globallyTruncated = false;

    // Get telemetry manager instance
    const telemetryManager = TelemetryManager.getInstance();
    const searchStartTime = performance.now();
    telemetryManager.logUsage(TELEMETRY_EVENTS.SEARCH_EXECUTED, {
      queryLength: query.length,
      caseSensitive: options.caseSensitive,
      hasIncludeFilter: !!options.include,
      hasExcludeFilter: !!options.exclude,
      hasWorkspaceRoot: !!options.workspaceRoot,
      maxResults: options.maxResults || 0,
      maxResultsPerFile: options.maxResultsPerFile || 0,
    });

    try {
      await this.cancelSearch(msgPipeline);

      this.abortController = new AbortController();
      currentAbortController = this.abortController;

      // Clear search highlights when starting a new search
      if (this.searchHighlightManager) {
        this.searchHighlightManager.clearSearch();
      }

      // Reset search session state
      this.searchCompleted = false;
      this.workspaceFiles.clear();

      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const maxResults = options.maxResults || config.get<number>('maxResults', 1000);
      const maxResultsPerFile =
        options.maxResultsPerFile || config.get<number>('maxResultsPerFile', 100);

      // Get workspace to search
      let workspacesToSearch: string[];

      if (options.workspaceRoot) {
        workspacesToSearch = [options.workspaceRoot];
      } else {
        // Default to all workspaces if no specific one is provided
        // Fetch directly from the provider to get the latest order
        workspacesToSearch = this.haystackProvider.getWorkspaceRoots();
      }
      // Filter out any potentially empty strings and then deduplicate
      workspacesToSearch = [...new Set(workspacesToSearch.filter((p) => p))];

      // Send initial message to indicate search has started
      await msgPipeline.post('searchStarted', {
        query,
        workspaces: workspacesToSearch.map((ws) => {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ws));
          const name = workspaceFolder?.name || ws.split(/[/\\]/).pop() || ws;
          return {
            path: ws,
            name,
          };
        }),
      });

      await vscode.commands.executeCommand('setContext', 'haystackSearching', true);

      const totalWorkspacesToSearch = workspacesToSearch.length;
      let completedSearchCount = 0;

      // Global helper function for search completion
      const sendSearchCompletion = async (truncated: boolean) => {
        // Defense against duplicate calls
        if (webviewPostMessageSentForCompletion) {
          return;
        }

        // This should only be called when ALL workspaces are completed
        this.searchCompleted = true;
        await msgPipeline.post('searchDone', {
          truncated,
        });
        webviewPostMessageSentForCompletion = true;

        if (this.abortController === currentAbortController) {
          this.abortController = null;
        }
        // Global level: only set when entire search session is done
        await vscode.commands.executeCommand('setContext', 'haystackSearching', false);
      };

      if (totalWorkspacesToSearch === 0) {
        if (!webviewPostMessageSentForCompletion) {
          await msgPipeline.post('searchDone', {
            truncated: false, // No search, so not truncated
          });
          webviewPostMessageSentForCompletion = true;
        }
        if (this.abortController === currentAbortController) {
          this.abortController = null;
        }
        await vscode.commands.executeCommand('setContext', 'haystackSearching', false);
        return;
      }

      // Start a new search session first
      this.haystackProvider.newSearch(query, {
        caseSensitive: options.caseSensitive,
        include: options.include,
        exclude: options.exclude,
        maxResults,
        maxResultsPerFile,
      });

      // Helper functions - defined outside workspace loop for reuse
      const getWorkspaceName = (wsRoot: string) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(wsRoot));
        return workspaceFolder?.name || wsRoot.split(/[/\\]/).pop() || wsRoot;
      };

      const sendUpdateResult = async (wsRoot: string, resultToSend: SearchContentResult) => {
        await msgPipeline.post('updateResult', {
          workspaceRoot: wsRoot,
          workspaceName: getWorkspaceName(wsRoot),
          result: resultToSend,
        });

        // Update search highlights if manager is available
        if (this.searchHighlightManager && resultToSend.file && resultToSend.lines) {
          const fullPath = vscode.Uri.joinPath(vscode.Uri.file(wsRoot), resultToSend.file);
          const fileUri = fullPath.toString();
          this.searchHighlightManager.updateSearchResult(fileUri, resultToSend.lines);
        }

        // Maintain state for the file
        if (resultToSend.file) {
          const newCount = resultToSend.lines ? resultToSend.lines.length : 0;
          const oldCount =
            this.workspaceFiles.get(wsRoot)?.get(resultToSend.file)?.resultCount || 0;
          const countDiff = newCount - oldCount;

          // Update global count
          globalResultsCount += countDiff;

          // Update file tracking
          if (!this.workspaceFiles.has(wsRoot)) {
            this.workspaceFiles.set(wsRoot, new Map<string, FileResultInfo>());
          }
          const workspaceFiles = this.workspaceFiles.get(wsRoot)!;
          workspaceFiles.set(resultToSend.file, { resultCount: newCount });
        }
      };

      const triggerGlobalTruncation = async () => {
        // Global level: mark as truncated and abort current controller
        globallyTruncated = true;
        if (!currentAbortController!.signal.aborted) {
          currentAbortController!.abort();
        }

        // Directly trigger completion - don't wait for isDone events that may never come
        completedSearchCount = totalWorkspacesToSearch;
        await sendSearchCompletion(true);
      };

      // Execute workspace searches sequentially to avoid overwhelming the system
      for (const workspaceRoot of workspacesToSearch) {
        if (currentAbortController!.signal.aborted) {
          console.log(
            `Haystack: Search operation cancelled/truncated before starting search for workspace ${workspaceRoot}`,
          );
          completedSearchCount++;
          if (completedSearchCount >= totalWorkspacesToSearch) {
            await sendSearchCompletion(globallyTruncated);
          }
          continue;
        }

        try {
          console.log(`Haystack: Searching in workspace ${workspaceRoot}`);

          await this.haystackProvider.searchAndListenWorkspace(
            workspaceRoot,
            async (result, isDone): Promise<boolean> => {
              // Phase 1: Already done/aborted - only accept updates to existing files
              if (this.searchCompleted || currentAbortController!.signal.aborted) {
                if (isDone) {
                  return true; // Allow done signal to pass through
                }

                if (result.file && this.workspaceFiles.get(workspaceRoot)?.has(result.file)) {
                  // Update existing file results
                  await sendUpdateResult(workspaceRoot, result);
                  return true;
                }

                // Reject new files
                return false;
              }

              // Phase 2: Still searching - decide whether to accept current result
              if (!isDone && result.file) {
                // Always accept updates to known files (even during search, even if empty)
                if (this.workspaceFiles.get(workspaceRoot)?.has(result.file)) {
                  await sendUpdateResult(workspaceRoot, result);
                  return true;
                }

                // For new files, only add if they have content
                if (result.lines && result.lines.length > 0) {
                  // For new files, check global limits
                  if (globallyTruncated) {
                    // If already globally truncated, reject new results
                    return false;
                  }

                  let linesToSend = result.lines;
                  let currentResultTruncatedByGlobalLimit = false;

                  // Check if we're hitting the global limit
                  let hitGlobalLimit = false;
                  let shouldRejectResult = false;

                  if (globalResultsCount + result.lines.length >= maxResults) {
                    hitGlobalLimit = true;
                    const remainingSlots = maxResults - globalResultsCount;
                    if (remainingSlots <= 0) {
                      // No more space, reject this result entirely
                      shouldRejectResult = true;
                    } else {
                      // Partial space available, truncate the result
                      linesToSend = result.lines.slice(0, remainingSlots);
                      currentResultTruncatedByGlobalLimit = true;
                    }
                  }

                  // Send the result if we're not rejecting it
                  if (!shouldRejectResult) {
                    const resultToSend = {
                      ...result,
                      lines: linesToSend,
                      truncate: result.truncate || currentResultTruncatedByGlobalLimit,
                    };
                    await sendUpdateResult(workspaceRoot, resultToSend);
                  }

                  // Unified global limit handling
                  if (hitGlobalLimit) {
                    await triggerGlobalTruncation();
                    return !shouldRejectResult; // true if we sent result, false if rejected
                  }

                  return true;
                } else {
                  // New file with no content - don't add it to known files
                  return false;
                }
              }

              // Phase 3: Transition to done/aborted state
              if (isDone) {
                completedSearchCount++;
                const allSearchesCompleted = completedSearchCount >= totalWorkspacesToSearch;

                if (allSearchesCompleted) {
                  await sendSearchCompletion(result.truncate || false || globallyTruncated);

                  // Record the duration of search.
                  telemetryManager.logPerformance(
                    TELEMETRY_EVENTS.SEARCH_EXECUTED_PERFORMANCE,
                    performance.now() - searchStartTime,
                    {
                      totalResults: globalResultsCount,
                      wasTruncated: globallyTruncated,
                      workspaceCount: totalWorkspacesToSearch,
                      queryLength: query.length,
                    },
                  );
                }
                return true;
              }

              return false; // Default: reject unknown cases
            },
            currentAbortController!.signal,
          );
        } catch (error) {
          console.error(`Error searching workspace ${workspaceRoot}: ${error}`);
          completedSearchCount++;
          if (completedSearchCount >= totalWorkspacesToSearch) {
            await sendSearchCompletion(globallyTruncated);
          }
        }
      }
    } catch (error) {
      telemetryManager.logError(
        TELEMETRY_EVENTS.SEARCH_EXECUTED_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        {
          queryLength: query.length,
          workspaceCount: this.haystackProvider.getWorkspaceRoots().length,
          searchDuration: performance.now() - searchStartTime,
        },
      );

      console.log(`Search error: ${error}`);
      this.searchCompleted = true;
      if (!webviewPostMessageSentForCompletion) {
        await msgPipeline.post('searchDone', {
          truncated: globallyTruncated,
        });
      }
      // cancelSearch handles abortController nullification and context setting.
      // If currentAbortController is this.abortController, cancelSearch will handle it.
      // If they are different (e.g. a new search started before this one errored out),
      // currentAbortController should still be aborted if it wasn't already.
      if (
        currentAbortController &&
        this.abortController === currentAbortController &&
        !currentAbortController.signal.aborted
      ) {
        currentAbortController.abort();
      }
      // Ensure cancelSearch is called to properly clean up the class-level state if it matches current operation
      await this.cancelSearch(msgPipeline);
    }
  }

  async cancelSearch(msgPipeline: ExtensionMessagePipeline) {
    // Always clear search highlights, regardless of search state
    if (this.searchHighlightManager) {
      this.searchHighlightManager.clearSearch();
    }

    if (this.abortController) {
      // Record when user cancel search operation.
      const telemetryManager = TelemetryManager.getInstance();
      telemetryManager.logUsage(TELEMETRY_EVENTS.SEARCH_CANCELED);

      await msgPipeline.post('searchCancelled');

      this.abortController.abort();
      this.abortController = null;
      // Reset search session state
      this.searchCompleted = false;
      this.workspaceFiles.clear();

      // Ensure context is reset when a search is cancelled
      vscode.commands.executeCommand('setContext', 'haystackSearching', false);
    }
  }

  async handleOpenFile(
    file: string,
    line: number,
    workspaceRoot: string,
    start?: number,
    end?: number,
  ) {
    try {
      if (!workspaceRoot) {
        throw new Error('No workspace root provided for the file');
      }

      // 'file' is the relative path, 'workspaceRoot' is the absolute path to the workspace.
      // Construct the full path.
      const fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), file).fsPath;

      const uri = vscode.Uri.file(fullPath);
      // Check if the file is already open in an editor
      let document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath);

      if (!document) {
        // If the document is not open, we need to open it
        document = await vscode.workspace.openTextDocument(uri);
      }

      const editor = await vscode.window.showTextDocument(document);

      if (start !== undefined && end !== undefined) {
        const startPos = new vscode.Position(line - 1, start);
        const endPos = new vscode.Position(line - 1, end);
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(
          new vscode.Range(startPos, endPos),
          vscode.TextEditorRevealType.InCenter,
        );
      } else {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  async handleFocusSearchInput(msgPipeline: ExtensionMessagePipeline) {
    await msgPipeline.post('focusSearchInput');
  }

  // Update the workspace roots when the DOM is loaded
  handleDomLoaded() {
    console.log('WebView DOM has been loaded');
    // Update the workspaceRoots in case they've changed
  }

  async handleVisibilityChange(msgPipeline: ExtensionMessagePipeline, isVisible: boolean) {
    console.log(`Search view visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

    await msgPipeline.post('visibilityChanged', {
      isVisible,
    });

    if (isVisible) {
      await this.handleFocusSearchInput(msgPipeline);
    }
  }
}
