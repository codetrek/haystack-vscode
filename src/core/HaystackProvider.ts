import * as vscode from 'vscode';
import axios from 'axios';
import {
  SearchContentRequest,
  SearchContentResponse,
  SearchContentResult,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  Filters,
  Exclude
} from '../types/search';
import { Haystack } from './Haystack';

// Haystack API URLs
const HAYSTACK_API_VERSION = `/api/v1`;
const WORKSPACE_CREATE_URL = `${HAYSTACK_API_VERSION}/workspace/create`;
const WORKSPACE_UPDATE_URL = `${HAYSTACK_API_VERSION}/workspace/update`;
const WORKSPACE_GET_URL = `${HAYSTACK_API_VERSION}/workspace/get`;
const WORKSPACE_SYNC_URL = `${HAYSTACK_API_VERSION}/workspace/sync`;
const DOCUMENT_UPDATE_URL = `${HAYSTACK_API_VERSION}/document/update`;
const DOCUMENT_DELETE_URL = `${HAYSTACK_API_VERSION}/document/delete`;
const SEARCH_CONTENT_URL = `${HAYSTACK_API_VERSION}/search/content`;

export class HaystackProvider {
  private workspaceRoot: string;
  private updateTimeouts: Map<string, NodeJS.Timeout>;
  private periodicTaskInterval: NodeJS.Timeout | null;
  private statusUpdateInterval: NodeJS.Timeout | null;
  private haystack: Haystack;

  constructor(haystack: Haystack) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';
    this.updateTimeouts = new Map();
    this.periodicTaskInterval = null;
    this.statusUpdateInterval = null;
    this.haystack = haystack;
    // Start periodic workspace creation task
    this.startPeriodicTask();

    // Listen for file save events
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (document.uri.scheme === 'file') {
        try {
          // Convert absolute path to relative path
          const relativePath = vscode.workspace.asRelativePath(document.uri);

          // Clear existing timeout if any
          const existingTimeout = this.updateTimeouts.get(relativePath);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Set new timeout
          const timeout = setTimeout(async () => {
            await this.updateDocument(relativePath);
            this.updateTimeouts.delete(relativePath);
          }, 500);

          this.updateTimeouts.set(relativePath, timeout);
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
            const relativePath = vscode.workspace.asRelativePath(uri);
            await this.deleteDocument(relativePath);
          } catch (error) {
            console.error(`Failed to delete document: ${error}`);
          }
        }
      }
    });

    // Listen for file restore events
    vscode.workspace.onDidCreateFiles(async (event) => {
      for (const uri of event.files) {
        if (uri.scheme === 'file') {
          try {
            const relativePath = vscode.workspace.asRelativePath(uri);
            await this.updateDocument(relativePath);
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

  private async post(uri: string, data: any) {
    if (!this.haystack || this.haystack.getStatus() !== 'running') {
      throw new Error('Haystack is not running');
    }

    return await this.haystack.post(uri, data);
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
        await this.createWorkspace();
      } catch (error) {
        console.error(`Failed to create workspace in periodic task: ${error}`);
      }
    }, TWENTY_FOUR_HOURS);
  }

  async createWorkspace(): Promise<void> {
    if (!this.workspaceRoot) {
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
        workspace: this.workspaceRoot,
        use_global_filters: useGlobalFilters,
        filters: {
          exclude: {
            use_git_ignore: useGitIgnore,
            customized: customExclude
          },
          include: includePatterns
        }
      };

      const response = await this.post(WORKSPACE_CREATE_URL, payload);

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to create workspace');
      }
    } catch (error) {
      throw new Error(`Failed to create workspace: ${error}`);
    }
  }

  async updateDocument(filePath: string): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('No workspace folder is opened');
    }

    try {
      const response = await this.post(DOCUMENT_UPDATE_URL, {
        workspace: this.workspaceRoot,
        path: filePath
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to update document');
      }
    } catch (error) {
      throw new Error(`Failed to update document: ${error}`);
    }
  }

  async deleteDocument(filePath: string): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('No workspace folder is opened');
    }

    try {
      const response = await this.post(DOCUMENT_DELETE_URL, {
        workspace: this.workspaceRoot,
        path: filePath
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'Failed to delete document');
      }
    } catch (error) {
      throw new Error(`Failed to delete document: ${error}`);
    }
  }

  async searchStream(query: string, options: {
    caseSensitive?: boolean;
    include?: string;
    exclude?: string;
    maxResults?: number;
    maxResultsPerFile?: number;
  }, onResult: (result: SearchContentResult, isDone: boolean) => void, abortSignal?: AbortSignal): Promise<void> {
    if (!this.haystack || this.haystack.getStatus() !== 'running') {
      throw new Error('Haystack is not running');
    }

    const searchRequest: SearchContentRequest = {
      workspace: this.workspaceRoot,
      query: query,
      editor: {
        open_files: this.getAllOpenTextDocumentPaths(),
        active_file: vscode.window.activeTextEditor?.document?.uri
          ? vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri)
          : ''
      },
      case_sensitive: options.caseSensitive,
      filters: {
        include: options.include,
        exclude: options.exclude
      },
      limit: {
        max_results: options.maxResults,
        max_results_per_file: options.maxResultsPerFile
      }
    };

    try {
      // Get the stream from the Haystack API
      const stream = await this.haystack.postStream(SEARCH_CONTENT_URL, searchRequest);

      if (!stream) {
        // If stream isn't available, call onResult with empty result and isDone=true
        onResult({
          file: '',
          lines: [],
          truncate: false
        }, true);
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
        abortSignal.addEventListener('abort', () => {
          console.log('Search aborted by user');
          done = true;
          // Release the reader to stop receiving chunks
          reader.cancel('Search cancelled by user').catch(error => {
            console.error('Error cancelling reader:', error);
          });
          // Notify caller of the aborted search
          onResult({
            file: '',
            lines: [],
            truncate: false
          }, true);
        }, { once: true });
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
              this.processEventData(buffer, onResult, true);
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
          this.processEventData(eventsData, onResult, false);
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
      onResult({
        file: '',
        lines: [],
        truncate: false
      }, true);
    }
  }

  private processEventData(eventsData: string, onResult: (result: SearchContentResult, isDone: boolean) => void, isFinal: boolean): void {
    // Split the data into individual events
    const events = eventsData.split('\n\n').filter(event => event.trim());

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
          onResult(JSON.parse(eventData), false);
        } catch (e) {
          console.error('Error parsing SSE event data:', e);
        }
      } else if (eventType === 'done' && eventData) {
        try {
          // Process completion event
          onResult(JSON.parse(eventData), true);
        }catch (e) {
          onResult({file: '', lines: [], truncate: false}, true);
        }
      }
    }
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async getWorkspaceStatus(): Promise<{ indexing: boolean; totalFiles: number; indexedFiles: number; error?: string }> {
    if (!this.workspaceRoot) {
      return {
        indexing: false,
        totalFiles: 0,
        indexedFiles: 0,
        error: 'No workspace folder is opened'
      };
    }

    try {
      const response = await this.post(WORKSPACE_GET_URL, {
        workspace: this.workspaceRoot
      });

      if (response.data.code === 1) {
        // Workspace not found, try to create it
        console.log(`Haystack: Workspace '${this.workspaceRoot}' not found. Attempting to create...`);
        try {
          await this.createWorkspace();
          console.log(`Haystack: Workspace '${this.workspaceRoot}' created successfully. Initial sync triggered.`);
          // Return status indicating indexing has started
          return {
            indexing: true,
            totalFiles: 0, // Total files unknown until first sync completes
            indexedFiles: 0
          };
        } catch (creationError: any) {
          const errorMessage = creationError.message || String(creationError);
          if (errorMessage.includes('Workspace already exists')) {
            console.warn(`Haystack: Workspace '${this.workspaceRoot}' was created concurrently.`);
            // Workspace created by another process, status will update shortly
            return {
              indexing: false,
              totalFiles: 0,
              indexedFiles: 0,
              error: 'Workspace status update pending after concurrent creation'
            };
          } else {
            console.error(`Haystack: Failed to automatically create workspace '${this.workspaceRoot}': ${errorMessage}`);
            return {
              indexing: false,
              totalFiles: 0,
              indexedFiles: 0,
              error: `Failed to create workspace: ${errorMessage}`
            };
          }
        }
      } else if (response.data.code === 0) {
        // Successfully fetched status
        const statusData = response.data.data;
        return {
          indexing: statusData.indexing || false,
          totalFiles: statusData.total_files || 0,
          indexedFiles: statusData.indexed_files || 0
        };
      } else {
        // Handle other non-zero error codes
        console.error(`Haystack: Error getting workspace status for '${this.workspaceRoot}': ${response.data.message || 'Unknown error'}`);
        return {
          indexing: false,
          totalFiles: 0,
          indexedFiles: 0,
          error: `Error fetching workspace status: ${response.data.message || 'Unknown error'}`
        };
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to connect')) {
        console.error(`Haystack: Failed to connect to Haystack server. Ensure it's running.`);
        return {
          indexing: false,
          totalFiles: 0,
          indexedFiles: 0,
          error: 'Haystack server is not running or unreachable.'
        };
      }
      console.error(`Haystack: Unexpected error getting workspace status for '${this.workspaceRoot}': ${errorMessage}`);
      return {
        indexing: false,
        totalFiles: 0,
        indexedFiles: 0,
        error: `Unexpected error fetching status: ${errorMessage}`
      };
    }
  }

  async syncWorkspace(): Promise<void> {
    if (!this.workspaceRoot) {
      // No workspace folder is opened
      return
    }

    try {
      // Get configuration values
      const config = vscode.workspace.getConfiguration('haystack.search');
      const useGlobalFilters = config.get<boolean>('useGlobalFilters', true);
      const useGitIgnore = config.get<boolean>('exclude.useGitIgnore', false);
      const customExclude = config.get<string[]>('exclude.custom', []);
      const includePatterns = config.get<string[]>('include', ['**/*']);

      // Build request payload with settings for workspace update
      const updatePayload: UpdateWorkspaceRequest = {
        workspace: this.workspaceRoot,
        use_global_filters: useGlobalFilters,
        filters: {
          exclude: {
            use_git_ignore: useGitIgnore,
            customized: customExclude
          },
          include: includePatterns
        }
      };

      // First update the workspace with the configuration
      const updateResponse = await this.post(WORKSPACE_UPDATE_URL, updatePayload);

      if (updateResponse.data.code !== 0) {
        throw new Error(updateResponse.data.message || 'Failed to update workspace');
      }

      // Then sync the workspace (only send workspace path)
      const syncResponse = await this.post(WORKSPACE_SYNC_URL, {
        workspace: this.workspaceRoot
      });

      if (syncResponse.data.code !== 0) {
        throw new Error(syncResponse.data.message || 'Failed to sync workspace');
      }
    } catch (error) {
      throw new Error(`Failed to sync workspace: ${error}`);
    }
  }

  async startServer(): Promise<void> {
    if (!this.haystack) {
      throw new Error('Haystack instance is not available');
    }

    try {
      // Start the Haystack server
      await this.haystack.startServer();

      // Create workspace after server starts
      await this.createWorkspace();
    } catch (error) {
      throw new Error(`Failed to start Haystack server: ${error}`);
    }
  }

  startStatusUpdates(callback: (status: { indexing: boolean; totalFiles: number; indexedFiles: number; error?: string }) => void) {
    // Clear existing interval if any
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }

    // Define the update function
    const updateStatus = async () => {
      const status = await this.getWorkspaceStatus();
      callback(status);
    };

    // Call immediately and then set interval
    updateStatus();
    this.statusUpdateInterval = setInterval(updateStatus, 5000); // Update every 5 seconds
  }

  stopStatusUpdates() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  dispose() {
    // Clear timeouts and intervals
    this.updateTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.updateTimeouts.clear();
    if (this.periodicTaskInterval) {
      clearInterval(this.periodicTaskInterval);
      this.periodicTaskInterval = null;
    }
    this.stopStatusUpdates();
  }

  /**
   * Get paths for all open tabs in VSCode
   * This method collects all open tabs including visible and non-visible ones
   */
  private getAllOpenTextDocumentPaths(): string[] {
    // Get all open text documents in the workspace
    const allOpenDocs = vscode.workspace.textDocuments;

    // Get visible editors for tabs that are currently visible
    const visibleEditors = vscode.window.visibleTextEditors;

    // Combine both sources to ensure we get all tabs
    const allPaths: string[] = [];

    // Add paths from all text documents
    allOpenDocs
      .filter(doc => doc.uri && doc.uri.scheme === 'file')
      .forEach(doc => {
        const relativePath = vscode.workspace.asRelativePath(doc.uri);
        if (!allPaths.includes(relativePath)) {
          allPaths.push(relativePath);
        }
      });

    // Add paths from visible editors (some tabs might not be in text documents)
    visibleEditors
      .filter(editor => editor.document && editor.document.uri && editor.document.uri.scheme === 'file')
      .forEach(editor => {
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
        if (!allPaths.includes(relativePath)) {
          allPaths.push(relativePath);
        }
      });

    // Log the number of paths found for debugging
    console.log(`Found ${allPaths.length} open tabs in VSCode`);

    return allPaths;
  }
}
