import * as vscode from 'vscode';
import * as path from 'path';
import {
  CreateWorkspaceRequest,
  SearchContentRequest,
  SearchContentResult,
  SearchFilesResponse,
  SearchFilesResult,
  SearchSymbolsResponse,
  UpdateWorkspaceRequest,
  UnsavedFile,
  BaseSearchOptions,
  SearchStreamOptions,
  SearchSession,
  WorkspaceSearchState,
} from '../types/search';
import { IHaystack } from './IHaystack';
import { TelemetryManager } from '../monitor/TelemetryManager';
import { TELEMETRY_EVENTS } from '../monitor/TelemetryEvents';
// Haystack API URLs
const HAYSTACK_API_VERSION = '/api/v1';
const WORKSPACE_CREATE_URL = `${HAYSTACK_API_VERSION}/workspace/create`;
const WORKSPACE_UPDATE_URL = `${HAYSTACK_API_VERSION}/workspace/update`;
const WORKSPACE_GET_URL = `${HAYSTACK_API_VERSION}/workspace/get`;
const WORKSPACE_SYNC_URL = `${HAYSTACK_API_VERSION}/workspace/sync`;
const DOCUMENT_UPDATE_URL = `${HAYSTACK_API_VERSION}/document/update`;
const DOCUMENT_DELETE_URL = `${HAYSTACK_API_VERSION}/document/delete`;
const SEARCH_CONTENT_URL = `${HAYSTACK_API_VERSION}/search/content`;
const SEARCH_SYMBOLS_URL = `${HAYSTACK_API_VERSION}/search/symbols`;
const SEARCH_FILES_URL = `${HAYSTACK_API_VERSION}/search/files`;

interface HaystackResponseData {
  code: number;
  message?: string;
  data?: unknown;
}

interface HaystackResponse {
  data: HaystackResponseData;
  status?: number; // Optional status, as it's used in one place
}

interface WorkspaceStatusData {
  indexing: boolean;
  total_files: number;
  indexed_files: number;
}

/**
 * Generic TextDocument event debounce handler class
 */
class TextDocumentDebouncer {
  private timeouts: Map<string, Map<string, NodeJS.Timeout>> = new Map();

  constructor(private delay = 500) {}

  /**
   * Schedule a debounced callback
   * @param workspaceRoot workspace root path
   * @param filePath relative file path
   * @param callback callback function to execute
   */
  schedule(workspaceRoot: string, filePath: string, callback: () => void | Promise<void>): void {
    // Get or create the timeout map for this workspace
    let workspaceTimeouts = this.timeouts.get(workspaceRoot);
    if (!workspaceTimeouts) {
      workspaceTimeouts = new Map();
      this.timeouts.set(workspaceRoot, workspaceTimeouts);
    }

    // Clear existing timeout if any
    const existingTimeout = workspaceTimeouts.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new debounced timeout
    const timeout = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`Debounced callback failed for ${filePath}:`, error);
      }

      // Clean up after execution
      workspaceTimeouts?.delete(filePath);
      if (workspaceTimeouts?.size === 0) {
        this.timeouts.delete(workspaceRoot);
      }
    }, this.delay);

    workspaceTimeouts.set(filePath, timeout);
  }

  /**
   * Clear all pending timeouts
   */
  clear(): void {
    this.timeouts.forEach((timeoutsMap) => {
      timeoutsMap.forEach((timeout) => clearTimeout(timeout));
      timeoutsMap.clear();
    });
    this.timeouts.clear();
  }

  /**
   * Clear timeouts for a specific workspace
   * @param workspaceRoot workspace root path
   */
  clearWorkspace(workspaceRoot: string): void {
    const timeoutsMap = this.timeouts.get(workspaceRoot);
    if (timeoutsMap) {
      timeoutsMap.forEach((timeout) => clearTimeout(timeout));
      timeoutsMap.clear();
      this.timeouts.delete(workspaceRoot);
    }
  }
}

export class HaystackProvider {
  private workspaceRoots: string[] = [];
  private periodicTaskInterval: NodeJS.Timeout | null;
  private haystack: IHaystack;

  // Debouncer instances for different events
  private documentSaveDebouncer = new TextDocumentDebouncer(500);
  private documentChangeDebouncer = new TextDocumentDebouncer(500);

  // Current search session for re-search functionality
  private currentSearchSession: SearchSession | null = null;

  /**
   * Check if a file path is within a workspace root.
   * Uses case-sensitive comparison on Linux/WSL and case-insensitive on Windows.
   */
  private isPathInWorkspace(filePath: string, workspaceRoot: string): boolean {
    // Normalize paths to use forward slashes
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const normalizedWorkspaceRoot = workspaceRoot.replace(/\\/g, '/');

    // On Windows, do case-insensitive comparison
    // On Linux/WSL, do case-sensitive comparison
    if (process.platform === 'win32') {
      return normalizedFilePath.toLowerCase().startsWith(normalizedWorkspaceRoot.toLowerCase());
    } else {
      return normalizedFilePath.startsWith(normalizedWorkspaceRoot);
    }
  }

  constructor(haystack: IHaystack) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // Initialize all workspace roots
    this.initWorkspaceRoots(workspaceFolders);
    this.periodicTaskInterval = null;
    this.haystack = haystack;

    // Start periodic workspace creation task
    this.startPeriodicTask();

    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      this.handleWorkspaceFoldersChanged(event);
    });

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      this.handleConfigurationChanged(event);
    });

    // Listen for file save events
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme === 'file') {
        try {
          // Skip .code-workspace files explicitly
          if (document.uri.fsPath.toLowerCase().endsWith('.code-workspace')) {
            console.log(`Skipping .code-workspace file: ${document.uri.fsPath}`);
            return;
          }
          // Get the workspace root for this document
          const workspaceRoot = this.getWorkspaceRootForUri(document.uri);
          if (!workspaceRoot) {
            console.warn(`No workspace root found for document: ${document.uri.fsPath}`);
            return;
          }
          // Check if the file is actually inside the workspace
          if (!this.isPathInWorkspace(document.uri.fsPath, workspaceRoot)) {
            // File is outside the workspace (like .code-workspace files)
            console.log(`Skipping document outside workspace: ${document.uri.fsPath}`);
            return;
          }

          // Get the relative path from the workspace root
          const relativePath = path.relative(workspaceRoot, document.uri.fsPath);

          // Use debouncer to schedule document update
          this.documentSaveDebouncer.schedule(workspaceRoot, relativePath, async () => {
            await this.updateDocument(relativePath, workspaceRoot);
          });
        } catch (error) {
          console.error(`Failed to update document: ${error}`);
        }
      }
    });

    // Listen for file delete events
    vscode.workspace.onDidDeleteFiles(async (event) => {
      for (const uri of event.files) {
        if (uri.scheme === 'file') {
          try {
            const workspaceRoot = this.getWorkspaceRootForUri(uri);
            if (!workspaceRoot) {
              console.warn(`No workspace root found for deleted file: ${uri.fsPath}`);
              continue;
            }

            // Check if the file is actually inside the workspace
            if (!this.isPathInWorkspace(uri.fsPath, workspaceRoot)) {
              // File is outside the workspace (like .code-workspace files)
              console.log(`Skipping deleted file outside workspace: ${uri.fsPath}`);
              continue;
            }

            // Get the relative path from the workspace root
            const relativePath = path.relative(workspaceRoot, uri.fsPath);

            console.log(`Deleting file: ${relativePath} (workspace: ${workspaceRoot})`);
            await this.deleteDocument(relativePath, workspaceRoot);
          } catch (error) {
            console.error(`Failed to delete document: ${error}`);
          }
        }
      }
    });

    // Listen for file create events
    vscode.workspace.onDidCreateFiles(async (event) => {
      for (const uri of event.files) {
        if (uri.scheme === 'file') {
          try {
            const workspaceRoot = this.getWorkspaceRootForUri(uri);
            if (!workspaceRoot) {
              console.warn(`No workspace root found for created file: ${uri.fsPath}`);
              continue;
            }
            // Check if the file is actually inside the workspace
            if (!this.isPathInWorkspace(uri.fsPath, workspaceRoot)) {
              // File is outside the workspace (like .code-workspace files)
              console.log(`Skipping created file outside workspace: ${uri.fsPath}`);
              continue;
            }

            // Check if the file actually exists before trying to update
            try {
              await vscode.workspace.fs.stat(uri);
            } catch {
              console.warn(`File not found or cannot be accessed: ${uri.fsPath}. Skipping update.`);
              continue;
            }

            const relativePath = path.relative(workspaceRoot, uri.fsPath);

            console.log(`Updating created file: ${relativePath} (workspace: ${workspaceRoot})`);
            await this.updateDocument(relativePath, workspaceRoot);
          } catch (error) {
            console.error(`Failed to update restored document: ${error}`);
          }
        }
      }
    });

    // Listen for text document changes (for debounced re-search functionality)
    vscode.workspace.onDidChangeTextDocument((event) => {
      this.handleDocumentChange(event);
    });
  }

  public getHaystack() {
    return this.haystack;
  }

  /**
   * Start a new search session, clearing any existing search state
   */
  public newSearch(query: string, options: BaseSearchOptions): void {
    this.currentSearchSession = {
      query,
      options,
      timestamp: performance.now(),
      workspaceStates: new Map(),
    };

    console.log('Haystack: New search session started:', {
      query,
      timestamp: this.currentSearchSession.timestamp,
      options,
    });
  }

  /**
   * Execute search for a specific workspace and listen for file changes
   */
  public async searchAndListenWorkspace(
    workspaceRoot: string,
    onResult: (result: SearchContentResult, isDone: boolean) => Promise<boolean>,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    if (!this.currentSearchSession) {
      throw new Error('No active search session. Call newSearch() first.');
    }

    const session = this.currentSearchSession;
    const searchTimestamp = performance.now();

    // Create encapsulated callback functions with state management logic
    const onSearchResult = async (
      result: SearchContentResult,
      currentSearchTimestamp: number,
    ): Promise<void> => {
      // Check if this search session is still active
      if (!this.currentSearchSession || this.currentSearchSession.timestamp !== session.timestamp) {
        console.log('Ignoring result from outdated search session');
        return;
      }

      const workspaceState = this.currentSearchSession.workspaceStates.get(workspaceRoot);
      if (!workspaceState || !result.file) {
        return;
      }

      // Check if this file was modified during search and needs immediate re-search
      if (workspaceState.modifiedDuringSearch.has(result.file)) {
        console.log(
          `File ${result.file} was modified during search, discarding stale result and triggering re-search`,
        );
        workspaceState.modifiedDuringSearch.delete(result.file);

        // Trigger re-search using the common method
        this.performReSearch(result.file, workspaceRoot, session);

        return; // Don't process the stale result
      }

      // Check if this result is newer than the current file result
      // This automatically handles both re-search updates and invalidated original results
      const currentFileTimestamp = workspaceState.fileTimestamps.get(result.file) || 0;
      if (currentSearchTimestamp <= currentFileTimestamp) {
        console.log(
          `Result is outdated (${currentSearchTimestamp} <= ${currentFileTimestamp}), discarding`,
        );
        return;
      }

      // Check if this is the first time we're seeing this file (no existing timestamp)
      const isFirstTime = currentFileTimestamp === 0;

      if (isFirstTime) {
        // First time seeing this file - call upper layer callback to decide accept/reject
        const shouldAccept = await onResult(result, false);

        if (shouldAccept) {
          workspaceState.acceptedFiles.add(result.file);
          workspaceState.fileTimestamps.set(result.file, currentSearchTimestamp);
          console.log(
            `File accepted for first time: ${result.file} (timestamp: ${currentSearchTimestamp})`,
          );
        } else {
          console.log(`File rejected: ${result.file}`);
          // Don't track rejected files
        }
      } else {
        // File already has a timestamp - it was previously accepted
        // Just update the content, don't re-decide accept/reject
        await onResult(result, false);
        workspaceState.fileTimestamps.set(result.file, currentSearchTimestamp);
        console.log(`Updated accepted file: ${result.file} (timestamp: ${currentSearchTimestamp})`);
      }
    };

    const onDone = async (result: SearchContentResult): Promise<void> => {
      // Check if this search session is still active
      if (!this.currentSearchSession || this.currentSearchSession.timestamp !== session.timestamp) {
        console.log('Ignoring completion from outdated search session');
        return;
      }

      const workspaceState = this.currentSearchSession.workspaceStates.get(workspaceRoot);
      if (!workspaceState) {
        return;
      }

      // Mark search as completed for this workspace
      workspaceState.isCompleted = true;
      console.log(`Haystack: Search completed for workspace ${workspaceRoot}`);

      // Call the original callback for completion
      await onResult(result, true);
    };

    // Create workspace search state
    const workspaceState: WorkspaceSearchState = {
      isCompleted: false,
      acceptedFiles: new Set<string>(),
      fileTimestamps: new Map<string, number>(),
      modifiedDuringSearch: new Set<string>(),
      onSearchResult,
      onDone,
    };

    // Store the workspace state
    this.currentSearchSession.workspaceStates.set(workspaceRoot, workspaceState);

    console.log(`Haystack: Starting search for workspace ${workspaceRoot}`);

    // Execute the search using existing searchStream method
    await this.searchStream(
      this.currentSearchSession.query,
      {
        ...this.currentSearchSession.options,
        workspaceRoot,
      },
      async (result: SearchContentResult, isDone: boolean) => {
        if (isDone) {
          await onDone(result);
        } else {
          await onSearchResult(result, searchTimestamp);
        }
      },
      abortSignal,
    );
  }

  private post(uri: string, data: unknown): Promise<HaystackResponse> {
    if (!this.haystack || this.haystack.getStatus() !== 'running') {
      throw new Error('Haystack is not running');
    }

    return this.haystack.post(uri, data) as Promise<HaystackResponse>;
  }

  private startPeriodicTask() {
    // Clear existing interval if any
    if (this.periodicTaskInterval) {
      clearInterval(this.periodicTaskInterval);
    }

    // Set up new interval (24 hours in milliseconds)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    this.periodicTaskInterval = setInterval(async () => {
      try {
        // Create workspace for each workspace root
        for (const workspaceRoot of this.workspaceRoots) {
          try {
            await this.createWorkspace(workspaceRoot);
          } catch (error) {
            console.error(
              `Failed to create workspace for ${workspaceRoot} in periodic task: ${error}`,
            );
          }
        }
      } catch (error) {
        console.error(`Failed to create workspaces in periodic task: ${error}`);
      }
    }, TWENTY_FOUR_HOURS);
  }

  async createWorkspace(workspaceRoot?: string): Promise<void> {
    const rootPath = workspaceRoot || null;

    if (!rootPath) {
      throw new Error('No workspace folder is opened');
    }

    const startTime = performance.now();
    const telemetryManager = TelemetryManager.getInstance();

    try {
      // Track workspace creation start
      telemetryManager.logUsage(TELEMETRY_EVENTS.WORKSPACE_CREATION, {
        workspaceRoot: rootPath,
      });

      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const useGlobalFilters = config.get<boolean>('useGlobalFilters', true);
      const useGitIgnore = config.get<boolean>('exclude.useGitIgnore', false);
      const customExclude = config.get<string[]>('exclude.custom', []);
      const includePatterns = config.get<string[]>('include', ['**/*']);

      // Build request payload with settings
      const payload: CreateWorkspaceRequest = {
        workspace: rootPath,
        use_global_filters: useGlobalFilters,
        filters: {
          exclude: {
            use_git_ignore: useGitIgnore,
            customized: customExclude,
          },
          include: includePatterns,
        },
      };

      const response = await this.post(WORKSPACE_CREATE_URL, payload);

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to create workspace');
      }

      // Track successful workspace creation with performance metrics
      telemetryManager.logPerformance(
        TELEMETRY_EVENTS.WORKSPACE_CREATION_PERFORMANCE,
        performance.now() - startTime,
        {
          workspaceRoot: rootPath,
          useGlobalFilters,
          useGitIgnore,
          customExcludeCount: customExclude.length,
          includePatternCount: includePatterns.length,
        },
      );
    } catch (error) {
      // Track failed workspace creation
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      telemetryManager.logError(
        TELEMETRY_EVENTS.WORKSPACE_CREATION_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        {
          workspaceRoot: rootPath,
          duration,
          error: errorMessage,
        },
      );

      throw new Error(`Failed to create workspace: ${error}`);
    }
  }

  async updateDocument(filePath: string, workspaceRoot: string): Promise<void> {
    if (!workspaceRoot) {
      throw new Error('No workspace folder is opened');
    }

    try {
      // Convert Windows backslashes to forward slashes for consistency with Haystack API
      const normalizedFilePath = filePath.replace(/\\/g, '/');

      const response = await this.post(DOCUMENT_UPDATE_URL, {
        workspace: workspaceRoot,
        path: normalizedFilePath,
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to update document');
      }
    } catch (error) {
      throw new Error(`Failed to update document: ${error}`);
    }
  }

  async deleteDocument(filePath: string, workspaceRoot: string): Promise<void> {
    if (!workspaceRoot) {
      throw new Error('No workspace folder is opened');
    }

    try {
      // Convert Windows backslashes to forward slashes for consistency with Haystack API
      const normalizedFilePath = filePath.replace(/\\/g, '/');

      const response = await this.post(DOCUMENT_DELETE_URL, {
        workspace: workspaceRoot,
        path: normalizedFilePath,
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to delete document');
      }
    } catch (error) {
      throw new Error(`Failed to delete document: ${error}`);
    }
  }

  async searchStream(
    query: string,
    options: SearchStreamOptions,
    onResult: (result: SearchContentResult, isDone: boolean) => Promise<void>,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    if (!this.haystack || this.haystack.getStatus() !== 'running') {
      throw new Error('Haystack is not running');
    }

    // Use provided workspace root or default to the first one
    const workspaceRoot = options.workspaceRoot || null;
    if (!workspaceRoot) {
      throw new Error('No workspace folder is specified');
    }

    // Get unsaved files content (use provided ones or fetch all for workspace)
    const unsavedFiles = options.unsavedFiles || this.getUnsavedFiles(workspaceRoot);

    const searchRequest: SearchContentRequest = {
      workspace: workspaceRoot,
      query,
      editor: {
        open_files: this.getAllOpenTextDocumentPaths(workspaceRoot),
        active_file: vscode.window.activeTextEditor?.document?.uri
          ? workspaceRoot
            ? path.relative(workspaceRoot, vscode.window.activeTextEditor.document.uri.fsPath)
            : vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri)
          : '',
      },
      case_sensitive: options.caseSensitive,
      filters: {
        path: options.path,
        include: options.include,
        exclude: options.exclude,
      },
      limit: {
        max_results: options.maxResults,
        max_results_per_file: options.maxResultsPerFile,
      },
      before_after: options.beforeAfter,
      unsaved_files: unsavedFiles,
    };

    try {
      // Get the stream from the Haystack API
      const stream = await this.haystack.postStream(SEARCH_CONTENT_URL, searchRequest);

      if (!stream) {
        // If stream isn't available, call onResult with empty result and isDone=true
        await onResult(
          {
            file: '',
            lines: [],
            truncate: false,
          },
          true,
        );
        return;
      }

      // Create a TextDecoder to decode the response chunks
      const decoder = new TextDecoder();

      // Create a reader to read the stream
      const reader = stream.getReader();

      // Process each chunk of data from the stream
      let buffer = '';
      let done = false;

      // Add abort handler
      if (abortSignal) {
        abortSignal.addEventListener(
          'abort',
          async () => {
            console.log('Search aborted by user');
            done = true;
            // Release the reader to stop receiving chunks
            reader.cancel('Search cancelled by user').catch((error) => {
              console.error('Error cancelling reader:', error);
            });
            // Notify caller of the aborted search
            await onResult(
              {
                file: '',
                lines: [],
                truncate: false,
              },
              true,
            );
          },
          { once: true },
        );
      }

      while (!done) {
        // Check if search was aborted
        if (abortSignal?.aborted) {
          break;
        }

        // Read the next chunk
        const { value, done: isDone } = await reader.read();

        if (isDone) {
          done = true;
          // Process any remaining data in the buffer
          if (buffer.trim()) {
            try {
              await this.processEventData(buffer, onResult, true);
            } catch (e) {
              console.error('Error processing final SSE chunk:', e);
            }
          }
          break;
        }

        // Append the new chunk to the buffer
        buffer += decoder.decode(value, { stream: true });

        // Process any complete events in the buffer
        const eventEndIndex = buffer.lastIndexOf('\n\n');
        if (eventEndIndex > -1) {
          // Extract complete events
          const eventsData = buffer.substring(0, eventEndIndex);
          // Keep the rest in the buffer
          buffer = buffer.substring(eventEndIndex + 2);

          // Process each event
          await this.processEventData(eventsData, onResult, false);
        }
      }
    } catch (error) {
      // Don't report an error if the search was aborted
      if (abortSignal?.aborted) {
        console.log('Search aborted, suppressing error');
        return;
      }

      console.error(`Search streaming error: ${error}`);
      // Notify caller of the error
      await onResult(
        {
          file: '',
          lines: [],
          truncate: false,
        },
        true,
      );
    }
  }

  private async processEventData(
    eventsData: string,
    onResult: (result: SearchContentResult, isDone: boolean) => Promise<void>,
    _isFinal: boolean,
  ): Promise<void> {
    // Split the data into individual events
    const events = eventsData.split('\n\n').filter((event) => event.trim());

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const lines = event.split('\n');

      // Extract event type and data
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          eventData = line.substring(5).trim();
        }
      }

      // Process based on event type
      if (eventType === 'result' && eventData) {
        try {
          // Send the result to the callback
          await onResult(JSON.parse(eventData), false);
        } catch (e) {
          console.error('Error parsing SSE event data:', e);
        }
      } else if (eventType === 'done' && eventData) {
        try {
          // Process completion event
          await onResult(JSON.parse(eventData), true);
        } catch (parseError) {
          console.error('Error parsing SSE event data for done event:', parseError);
          await onResult({ file: '', lines: [], truncate: false }, true);
        }
      }
    }
  }
  /**
   * Get the default workspace root
   */
  public getWorkspaceRoot(): string {
    return this.workspaceRoots[0] || '';
  }

  /**
   * Get all workspace roots
   */
  public getWorkspaceRoots(): string[] {
    const activeEditor = vscode.window.activeTextEditor;
    let activeWorkspaceRoot: string | undefined;

    if (activeEditor && activeEditor.document.uri.scheme === 'file') {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (workspaceFolder) {
        activeWorkspaceRoot = workspaceFolder.uri.fsPath;
      }
    }

    if (activeWorkspaceRoot) {
      const orderedRoots = [activeWorkspaceRoot];
      for (const root of this.workspaceRoots) {
        if (root !== activeWorkspaceRoot) {
          orderedRoots.push(root);
        }
      }
      return orderedRoots;
    }
    return [...this.workspaceRoots];
  }

  /**
   * Get workspace status for a specific workspace or all workspaces
   */
  async getWorkspaceStatus(
    workspaceRoot?: string,
  ): Promise<{ indexing: boolean; totalFiles: number; indexedFiles: number; error?: string }> {
    // If a specific workspace is requested, get status for that one
    // Otherwise, use default workspace (for backward compatibility)
    const targetWorkspaceRoot = workspaceRoot || this.getWorkspaceRoot();

    if (!targetWorkspaceRoot) {
      return {
        indexing: false,
        totalFiles: 0,
        indexedFiles: 0,
        error: 'No workspace folder is opened',
      };
    }

    try {
      const response = await this.post(WORKSPACE_GET_URL, {
        workspace: targetWorkspaceRoot,
      });

      if (response.data.code === 1) {
        // Workspace not found, try to create it
        console.log(
          `Haystack: Workspace '${targetWorkspaceRoot}' not found. Attempting to create...`,
        );
        try {
          await this.createWorkspace(targetWorkspaceRoot);
          console.log(
            `Haystack: Workspace '${targetWorkspaceRoot}' created successfully. Initial sync triggered.`,
          );
          // Return status indicating indexing has started
          return {
            indexing: true,
            totalFiles: 0, // Total files unknown until first sync completes
            indexedFiles: 0,
          };
        } catch (creationError: unknown) {
          const errorMessage =
            creationError instanceof Error ? creationError.message : String(creationError);
          if (errorMessage.includes('Workspace already exists')) {
            console.warn(`Haystack: Workspace '${targetWorkspaceRoot}' was created concurrently.`);
            // Workspace created by another process, status will update shortly
            return {
              indexing: false,
              totalFiles: 0,
              indexedFiles: 0,
              error: 'Workspace status update pending after concurrent creation',
            };
          } else {
            console.error(
              `Haystack: Failed to automatically create workspace '${targetWorkspaceRoot}': ${errorMessage}`,
            );
            return {
              indexing: false,
              totalFiles: 0,
              indexedFiles: 0,
              error: `Failed to create workspace: ${errorMessage}`,
            };
          }
        }
      } else if (response.data.code === 0) {
        // Successfully fetched status
        const statusData = response.data.data as WorkspaceStatusData;
        return {
          indexing: statusData.indexing || false,
          totalFiles: statusData.total_files || 0,
          indexedFiles: statusData.indexed_files || 0,
        };
      } else {
        // Handle other non-zero error codes
        console.error(
          `Haystack: Error getting workspace status for '${targetWorkspaceRoot}': ${response.data.message || 'Unknown error'}`,
        );
        return {
          indexing: false,
          totalFiles: 0,
          indexedFiles: 0,
          error: `Error fetching workspace status: ${response.data.message || 'Unknown error'}`,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        ['ECONNREFUSED', 'ENOENT', 'Failed to connect'].some((text) => errorMessage.includes(text))
      ) {
        console.error("Haystack: Failed to connect to Haystack server. Ensure it's running.");
        return {
          indexing: false,
          totalFiles: 0,
          indexedFiles: 0,
          error: 'Haystack server is not running or unreachable.',
        };
      }
      console.error(
        `Haystack: Unexpected error getting workspace status for '${targetWorkspaceRoot}': ${errorMessage}`,
      );
      return {
        indexing: false,
        totalFiles: 0,
        indexedFiles: 0,
        error: `Unexpected error fetching status: ${errorMessage}`,
      };
    }
  }

  /**
   * Sync all workspaces or a specific workspace if specified
   */
  async syncWorkspace(workspaceRoot?: string): Promise<void> {
    if (workspaceRoot) {
      // Sync a specific workspace
      console.log(`Haystack: Syncing specific workspace: ${workspaceRoot}`);
      await this.syncSingleWorkspace(workspaceRoot);
    } else {
      // Sync all workspaces
      console.log(`Haystack: Syncing all ${this.workspaceRoots.length} workspaces`);
      const currentWorkspaceRoots = this.getWorkspaceRoots(); // Get a stable list
      for (const root of currentWorkspaceRoots) {
        try {
          console.log(`Haystack: Starting sync for workspace: ${root}`);
          await this.syncSingleWorkspace(root);
        } catch (error) {
          console.error(`Failed to sync workspace ${root}: ${error}`);
        }
      }
      console.log('Haystack: Completed syncing all workspaces');
    }
  }

  /**
   * Sync a single workspace
   */
  private async syncSingleWorkspace(workspaceRoot: string): Promise<void> {
    console.log(`Haystack: Starting workspace sync process for ${workspaceRoot}`);

    const startTime = performance.now();
    const telemetryManager = TelemetryManager.getInstance();

    try {
      // Track workspace sync start
      telemetryManager.logUsage(TELEMETRY_EVENTS.WORKSPACE_SYNC, {
        workspaceRoot,
      });

      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const useGlobalFilters = config.get<boolean>('useGlobalFilters', true);
      const useGitIgnore = config.get<boolean>('exclude.useGitIgnore', false);
      const customExclude = config.get<string[]>('exclude.custom', []);
      const includePatterns = config.get<string[]>('include', ['**/*']);

      // Build request payload with settings for workspace update
      const updatePayload: UpdateWorkspaceRequest = {
        workspace: workspaceRoot,
        use_global_filters: useGlobalFilters,
        filters: {
          exclude: {
            use_git_ignore: useGitIgnore,
            customized: customExclude,
          },
          include: includePatterns,
        },
      };

      // First update the workspace with the configuration
      const updateResponse = await this.post(WORKSPACE_UPDATE_URL, updatePayload);
      if (updateResponse.data.code === 1 /* not-found */) {
        console.warn(`Workspace ${workspaceRoot} not found on server – creating`);
        await this.createWorkspace(workspaceRoot);
        // retry update or go straight to sync
      }
      if (updateResponse.data.code !== 0) {
        throw new Error(updateResponse.data.message || 'Failed to update workspace');
      }
      console.log(`Haystack: Successfully updated workspace configuration for ${workspaceRoot}`);

      // Then sync the workspace (only send workspace path)
      console.log(`Haystack: Starting indexing for ${workspaceRoot}`);
      const syncResponse = await this.post(WORKSPACE_SYNC_URL, {
        workspace: workspaceRoot,
      });

      if (syncResponse.data.code !== 0) {
        throw new Error(syncResponse.data.message || 'Failed to sync workspace');
      }

      const syncDuration = performance.now() - startTime;
      console.log(`Haystack: Successfully triggered indexing for ${workspaceRoot}`);

      // Track successful workspace sync with performance metrics
      telemetryManager.logPerformance(
        TELEMETRY_EVENTS.WORKSPACE_SYNC_PERFORMANCE,
        performance.now() - startTime,
        {
          workspaceRoot,
          syncDuration,
          useGlobalFilters,
          useGitIgnore,
          customExcludeCount: customExclude.length,
          includePatternCount: includePatterns.length,
        },
      );
    } catch (error) {
      // Track failed workspace sync
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      telemetryManager.logError(
        TELEMETRY_EVENTS.WORKSPACE_SYNC_FAILED,
        error instanceof Error ? error : new Error(String(error)),
        {
          workspaceRoot,
          duration,
          error: errorMessage,
        },
      );

      console.error(`Haystack: Failed to sync workspace ${workspaceRoot}: ${error}`);
      throw new Error(`Failed to sync workspace: ${error}`);
    }
  }

  async startServer(): Promise<void> {
    if (!this.haystack) {
      throw new Error('Haystack instance is not available');
    }

    try {
      console.log('Haystack: Starting server...');
      // Start the Haystack server
      this.haystack.startServer();

      // Create workspaces for all workspace roots
      console.log(
        `Haystack: Creating workspaces for ${this.workspaceRoots.length} workspace roots`,
      );
      for (const root of this.workspaceRoots) {
        try {
          console.log(`Haystack: Creating workspace for ${root}`);
          await this.createWorkspace(root);
          console.log(`Haystack: Successfully created workspace for ${root}`);
        } catch (error) {
          console.error(`Failed to create workspace for ${root}: ${error}`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to start Haystack server: ${error}`);
    }
  }

  dispose() {
    // Clear timeouts and intervals
    this.documentSaveDebouncer.clear();
    this.documentChangeDebouncer.clear();

    if (this.periodicTaskInterval) {
      clearInterval(this.periodicTaskInterval);
      this.periodicTaskInterval = null;
    }
  }

  /**
   * Get paths for all open tabs in VSCode
   * This method collects all open tabs including visible and non-visible ones
   * @param workspaceRoot Optional. If provided, paths will be relative to this root.
   */
  private getAllOpenTextDocumentPaths(workspaceRoot?: string): string[] {
    // Get all open text documents in the workspace
    const allOpenDocs = vscode.workspace.textDocuments;

    // Get visible editors for tabs that are currently visible
    const visibleEditors = vscode.window.visibleTextEditors;

    // Combine both sources to ensure we get all tabs
    const allPaths: string[] = [];

    // Add paths from all text documents
    allOpenDocs
      .filter((doc) => doc.uri && doc.uri.scheme === 'file')
      .forEach((doc) => {
        const relativePath = workspaceRoot
          ? path.relative(workspaceRoot, doc.uri.fsPath)
          : vscode.workspace.asRelativePath(doc.uri, false); // Use false to avoid prepending workspace folder name
        if (!allPaths.includes(relativePath)) {
          allPaths.push(relativePath);
        }
      });

    // Add paths from visible editors (some tabs might not be in text documents)
    visibleEditors
      .filter(
        (editor) => editor.document && editor.document.uri && editor.document.uri.scheme === 'file',
      )
      .forEach((editor) => {
        const relativePath = workspaceRoot
          ? path.relative(workspaceRoot, editor.document.uri.fsPath)
          : vscode.workspace.asRelativePath(editor.document.uri, false); // Use false to avoid prepending workspace folder name
        if (!allPaths.includes(relativePath)) {
          allPaths.push(relativePath);
        }
      });

    // Log the number of paths found for debugging
    console.log(`Found ${allPaths.length} open tabs in VSCode`);

    return allPaths;
  }
  /**
   * Initialize workspace roots from workspace folders
   */
  private initWorkspaceRoots(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
  ): void {
    this.workspaceRoots = [];

    if (workspaceFolders && workspaceFolders.length > 0) {
      // Add all workspace folder paths
      console.log(`Haystack: Initializing with ${workspaceFolders.length} workspace folders`);
      for (const folder of workspaceFolders) {
        this.workspaceRoots.push(folder.uri.fsPath);
        console.log(`Haystack: Added workspace root: ${folder.uri.fsPath} (${folder.name})`);
      }
    } else {
      console.log('Haystack: No workspace folders found, workspaceRoot is empty');
    }
  }
  /**
   * Handle workspace folder changes
   */
  private async handleWorkspaceFoldersChanged(
    event: vscode.WorkspaceFoldersChangeEvent,
  ): Promise<void> {
    console.log(
      `Haystack: Workspace folders changed. Added: ${event.added.length}, Removed: ${event.removed.length}`,
    );

    // Remove deleted folders
    for (const folder of event.removed) {
      const index = this.workspaceRoots.indexOf(folder.uri.fsPath);
      if (index !== -1) {
        this.workspaceRoots.splice(index, 1);
        console.log(`Haystack: Removed workspace root: ${folder.uri.fsPath} (${folder.name})`);

        // Clean up any pending timeouts for this workspace
        console.log(`Haystack: Cleaning up timeouts for removed workspace: ${folder.uri.fsPath}`);
        this.documentSaveDebouncer.clearWorkspace(folder.uri.fsPath);

        // Clean up any pending document change timeouts for this workspace
        console.log(
          `Haystack: Cleaning up document change timeouts for removed workspace: ${folder.uri.fsPath}`,
        );
        this.documentChangeDebouncer.clearWorkspace(folder.uri.fsPath);
      }
    }

    // Add new folders and create workspaces for them
    for (const folder of event.added) {
      const folderPath = folder.uri.fsPath;
      this.workspaceRoots.push(folderPath);
      console.log(`Haystack: Added new workspace root: ${folderPath} (${folder.name})`);

      // Create new workspace for the added folder
      try {
        console.log(`Haystack: Creating workspace for newly added folder: ${folderPath}`);
        await this.createWorkspace(folderPath);
        console.log(`Haystack: Successfully created workspace for: ${folderPath}`);
      } catch (error) {
        console.error(`Failed to create workspace for added folder ${folderPath}: ${error}`);
      }
    }
  }

  /**
   * Handle configuration changes.
   * If 'haystack.search' settings related to filters change, re-sync all workspaces.
   */
  private async handleConfigurationChanged(event: vscode.ConfigurationChangeEvent): Promise<void> {
    let affected = false;
    // Check if 'haystack.search' settings are affected for any of the current workspace roots
    // or globally if no workspace is open.
    for (const root of this.workspaceRoots) {
      // Pass the workspace folder URI as the scope to affectsConfiguration
      const workspaceFolderUri = vscode.Uri.file(root);
      if (event.affectsConfiguration('haystack.search', workspaceFolderUri)) {
        affected = true;
        break;
      }
    }
    if (!affected && this.workspaceRoots.length === 0) {
      // Check for global configuration change if no workspace is open
      if (event.affectsConfiguration('haystack.search')) {
        affected = true;
      }
    }

    if (affected) {
      // If any 'haystack.search' configuration is affected, a sync is needed.
      console.log('Haystack: Relevant search configuration changed. Re-syncing all workspaces.');
      // It's important to sync all, as global filters might affect all workspaces
      // if useGlobalFilters is true, or if a global setting itself changed.
      await this.syncWorkspace();
    }
  }

  /**
   * Search for symbols in the workspace
   */
  public async searchSymbols(
    workspaceRoot: string,
    query: string,
    fuzzy = true,
  ): Promise<SearchSymbolsResponse> {
    try {
      // Ensure the Haystack server is running
      if (!this.haystack || this.haystack.getStatus() !== 'running') {
        return {
          code: 503,
          message: 'Haystack server is not running',
        };
      }
      const requestData = {
        workspace: workspaceRoot,
        query,
        fuzzy,
      };

      const response = await this.post(SEARCH_SYMBOLS_URL, requestData);
      // Process the response
      if (response.data) {
        return {
          code: response.data.code || 200,
          message: response.data.message || 'Success',
          data: response.data.data as SearchSymbolsResponse['data'],
        };
      }
      return {
        code: response.status || 200,
        message: 'Success',
        data: response.data as SearchSymbolsResponse['data'],
      };
    } catch (error) {
      console.error('Failed to search symbols:', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Search for files in the workspace
   */
  public async searchFiles(
    workspaceRoot: string,
    query: string,
    limit = 100,
  ): Promise<SearchFilesResponse> {
    try {
      // Ensure the Haystack server is running
      if (!this.haystack || this.haystack.getStatus() !== 'running') {
        return {
          code: 503,
          message: 'Haystack server is not running',
        };
      }
      const requestData = {
        workspace: workspaceRoot,
        query,
        limit,
      };

      const response = await this.post(SEARCH_FILES_URL, requestData);
      // Process the response
      if (response.data) {
        return {
          code: response.data.code || 200,
          message: response.data.message || 'Success',
          data: response.data.data as SearchFilesResult,
        };
      }
      return {
        code: response.status || 200,
        message: 'Unknown error',
      };
    } catch (error) {
      console.error('Failed to search files:', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search for content in a single file, using the latest unsaved content if available
   * @param filePath Relative path to the file within the workspace
   * @param workspaceRoot Absolute path to the workspace root
   * @param query Search query
   * @param options Search options (caseSensitive, beforeAfter, etc.)
   * @param abortSignal Optional abort signal for cancelling the search
   * @returns Promise resolving to SearchContentResult or undefined if no results found
   */
  public async searchSingleFile(
    filePath: string,
    workspaceRoot: string,
    query: string,
    options: BaseSearchOptions,
    abortSignal?: AbortSignal,
  ): Promise<SearchContentResult | undefined> {
    // Collect search results
    let searchResult: SearchContentResult | undefined;

    // Get unsaved content for the specific file if it exists and is dirty
    const unsavedFiles: UnsavedFile[] = [];
    const document = vscode.workspace.textDocuments.find(
      (doc) =>
        doc.uri.scheme === 'file' && path.relative(workspaceRoot, doc.uri.fsPath) === filePath,
    );

    if (document && document.isDirty) {
      unsavedFiles.push({
        path: filePath,
        content: document.getText(),
      });
    }

    // Use searchStream to perform the actual search
    await this.searchStream(
      query,
      {
        ...options,
        workspaceRoot,
        path: filePath, // Filter to search only this specific file
        unsavedFiles, // Pass the specific file's unsaved content
      },
      (result: SearchContentResult, isDone: boolean): Promise<void> => {
        // Collect the first result with actual content
        if (!isDone && result.file && result.lines && result.lines.length > 0) {
          searchResult = result;
        }
        return Promise.resolve();
      },
      abortSignal,
    );

    // Return the result if it has content, otherwise undefined
    return searchResult && searchResult.lines && searchResult.lines.length > 0
      ? searchResult
      : undefined;
  }

  /**
   * Get the workspace root for a given URI
   */
  private getWorkspaceRootForUri(uri: vscode.Uri): string | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    return workspaceFolder?.uri.fsPath;
  }

  /**
   * Get unsaved files content for the specified workspace
   */
  private getUnsavedFiles(workspaceRoot: string): UnsavedFile[] {
    const unsavedFiles: UnsavedFile[] = [];

    // Get all open text documents
    const openDocuments = vscode.workspace.textDocuments;

    for (const document of openDocuments) {
      // Skip if document is not a file or not in the workspace
      if (document.uri.scheme !== 'file') {
        continue;
      }

      const documentPath = document.uri.fsPath;
      if (!this.isPathInWorkspace(documentPath, workspaceRoot)) {
        continue;
      }

      // Check if document is dirty (has unsaved changes)
      if (document.isDirty) {
        const relativePath = path.relative(workspaceRoot, documentPath);
        unsavedFiles.push({
          path: relativePath,
          content: document.getText(),
        });
      }
    }

    return unsavedFiles;
  }

  /**
   * Handle text document changes for debounced re-search functionality
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const document = event.document;

    // Only handle file-type documents
    if (document.uri.scheme !== 'file') {
      return;
    }

    const workspaceRoot = this.getWorkspaceRootForUri(document.uri);
    if (!workspaceRoot) {
      return;
    }

    // Check if the file is actually inside the workspace
    if (!this.isPathInWorkspace(document.uri.fsPath, workspaceRoot)) {
      return;
    }

    const relativePath = path.relative(workspaceRoot, document.uri.fsPath);

    // Use debounce mechanism to handle document changes
    this.documentChangeDebouncer.schedule(workspaceRoot, relativePath, () => {
      this.onDocumentChanged(workspaceRoot, relativePath);
    });
  }

  /**
   * Called when a document change is debounced and ready to process
   */
  private onDocumentChanged(workspaceRoot: string, filePath: string): void {
    console.log(`Document changed: ${filePath} in workspace: ${workspaceRoot}`);

    // Check if there's an active search session
    if (!this.currentSearchSession) {
      console.log('No active search session, skipping re-search');
      return;
    }

    const session = this.currentSearchSession;

    // Find the specific workspace state for this file's workspace
    const workspaceState = session.workspaceStates.get(workspaceRoot);
    if (!workspaceState) {
      console.log(`No search state found for workspace ${workspaceRoot}, skipping re-search`);
      return;
    }

    // Check if this file is already known (accepted) - if so, re-search immediately
    if (workspaceState.acceptedFiles.has(filePath)) {
      console.log(`File ${filePath} is already accepted, performing immediate re-search`);
      this.performReSearch(filePath, workspaceRoot, session);
    } else if (!workspaceState.isCompleted) {
      // File is not yet known and search is still in progress
      // Mark it as modified so we can re-search it when its result arrives
      console.log(`File ${filePath} was modified during search, marking for future re-search`);
      workspaceState.modifiedDuringSearch.add(filePath);
    } else {
      // Search is completed and file is not in results - ignore the change
      console.log(`Skipping re-search for ${filePath}: search completed and file not in results`);
    }
  }

  /**
   * Common method to perform re-search for a file
   */
  private performReSearch(filePath: string, workspaceRoot: string, session: SearchSession): void {
    // Record the timestamp when this re-search starts
    const reSearchTimestamp = performance.now();
    console.log(
      `Starting re-search for ${filePath} at timestamp ${reSearchTimestamp} in workspace ${workspaceRoot}`,
    );

    // Perform re-search using the same query and options as the active search
    this.searchSingleFile(filePath, workspaceRoot, session.query, session.options)
      .then(async (result) => {
        // Verify the search session is still active and valid
        if (
          !this.currentSearchSession ||
          this.currentSearchSession.timestamp !== session.timestamp
        ) {
          console.log('Active search session changed, discarding re-search result');
          return;
        }

        const currentWorkspaceState = this.currentSearchSession.workspaceStates.get(workspaceRoot);
        if (!currentWorkspaceState) {
          console.log(
            `Workspace state for ${workspaceRoot} no longer exists, discarding re-search result`,
          );
          return;
        }

        console.log(`Re-search completed for ${filePath} in workspace ${workspaceRoot}`);

        // Call the saved callback with the re-search result (both empty and non-empty)
        const finalResult = result || {
          file: filePath,
          lines: [],
          truncate: false,
        };

        await currentWorkspaceState.onSearchResult(finalResult, reSearchTimestamp);
      })
      .catch((error) => {
        console.error(`Re-search failed for ${filePath} in workspace ${workspaceRoot}:`, error);
      });
  }
}
