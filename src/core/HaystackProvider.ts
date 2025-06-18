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
} from '../types/search';
import { IHaystack } from './IHaystack';

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

export class HaystackProvider {
  private workspaceRoots: string[] = [];
  private updateTimeouts: Map<string, Map<string, NodeJS.Timeout>> = new Map(); // Map of workspaceRoot -> (relativePath -> timeout)
  private periodicTaskInterval: NodeJS.Timeout | null;
  private haystack: IHaystack;

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
          if (!document.uri.fsPath.toLowerCase().startsWith(workspaceRoot.toLowerCase())) {
            // File is outside the workspace (like .code-workspace files)
            console.log(`Skipping document outside workspace: ${document.uri.fsPath}`);
            return;
          }

          // Get the relative path from the workspace root
          const relativePath = path.relative(workspaceRoot, document.uri.fsPath);

          // Get or create the timeout map for this workspace
          let workspaceTimeouts = this.updateTimeouts.get(workspaceRoot);
          if (!workspaceTimeouts) {
            workspaceTimeouts = new Map<string, NodeJS.Timeout>();
            this.updateTimeouts.set(workspaceRoot, workspaceTimeouts);
          }

          // Clear existing timeout if any
          const existingTimeout = workspaceTimeouts.get(relativePath);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Set new timeout
          const timeout = setTimeout(async () => {
            await this.updateDocument(relativePath, workspaceRoot);
            workspaceTimeouts?.delete(relativePath);
            if (workspaceTimeouts?.size === 0) {
              this.updateTimeouts.delete(workspaceRoot);
            }
          }, 500);

          workspaceTimeouts.set(relativePath, timeout);
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
            if (!uri.fsPath.toLowerCase().startsWith(workspaceRoot.toLowerCase())) {
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
            if (!uri.fsPath.toLowerCase().startsWith(workspaceRoot.toLowerCase())) {
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
  }

  public getHaystack() {
    return this.haystack;
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

    try {
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
    } catch (error) {
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
    options: {
      workspaceRoot?: string; // Added workspace root parameter
      path?: string;
      caseSensitive?: boolean;
      include?: string;
      exclude?: string;
      maxResults?: number;
      maxResultsPerFile?: number;
      beforeAfter?: number;
    },
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
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to connect')) {
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
    try {
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
      console.log(`Haystack: Successfully triggered indexing for ${workspaceRoot}`);
    } catch (error) {
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
    this.updateTimeouts.forEach((timeoutsMap) => {
      timeoutsMap.forEach((timeout) => clearTimeout(timeout));
      timeoutsMap.clear();
    });
    this.updateTimeouts.clear();
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
        if (this.updateTimeouts.has(folder.uri.fsPath)) {
          console.log(`Haystack: Cleaning up timeouts for removed workspace: ${folder.uri.fsPath}`);
          this.updateTimeouts.delete(folder.uri.fsPath);
        }
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
   * Get the workspace root for a given URI
   */
  private getWorkspaceRootForUri(uri: vscode.Uri): string | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    return workspaceFolder?.uri.fsPath;
  }
}
