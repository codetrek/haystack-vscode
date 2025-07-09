import * as vscode from 'vscode';
import { HaystackProvider } from '../core/HaystackProvider';
import { getSearchTemplate } from '../template';
import { SearchHandlers } from './components/searchHandlers';
import { ExtensionMessagePipeline } from '@/message/extension';
import { SearchHighlightManager } from './SearchHighlight';

export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'haystackSearch';

  // Store the webview view reference
  private _view?: vscode.WebviewView;
  private readonly _searchHandlers: SearchHandlers;
  private _statusBarItem: vscode.StatusBarItem;
  private _statusUpdateInterval: NodeJS.Timeout | null = null;
  private _pendingSearchText?: string;
  private _extensionUri!: vscode.Uri;
  private _msgPipeline?: ExtensionMessagePipeline;

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _haystackProvider: HaystackProvider,
    private readonly _isHaystackSupported: boolean,
    private readonly _searchHighlightManager?: SearchHighlightManager,
  ) {
    this._extensionUri = _extensionContext.extensionUri;
    this._searchHandlers = new SearchHandlers(_haystackProvider, _searchHighlightManager);
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    // Start status updates immediately when the provider is created
    this.startStatusUpdates();

    // Listen for Haystack status changes
    this._haystackProvider.getHaystack()?.on('status-change', () => {
      this.updateStatusbar();
    });
    this._haystackProvider.getHaystack()?.on('install-status-change', () => {
      this.updateStatusbar();
    });
    this._haystackProvider.getHaystack()?.on('download-progress', () => {
      this.updateStatusbar();
    });
    this._haystackProvider.getHaystack()?.on('error', () => {
      this.updateStatusbar();
    });
    this._haystackProvider.getHaystack()?.on('starting', () => {
      this.updateStatusbar();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    // Store the webview reference
    this._view = webviewView;
    this._msgPipeline = new ExtensionMessagePipeline(webviewView.webview, webviewView.webview);
    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'resources'),
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
      ],
    };

    // Set HTML content only if it hasn't been set before
    if (!webviewView.webview.html) {
      webviewView.webview.html = getSearchTemplate(this._extensionContext, webviewView.webview);
    }

    // Handle messages from the webview
    this._msgPipeline.on('search', async (data) => {
      await this._searchHandlers.handleSearch(this._msgPipeline!, data.query, data.options);
    });
    this._msgPipeline.on('cancelSearch', async () => {
      await this._searchHandlers.cancelSearch(this._msgPipeline!);
    });
    this._msgPipeline.on('openFile', async (data) => {
      if (data.file && typeof data.line === 'number' && data.workspaceRoot) {
        await this._searchHandlers.handleOpenFile(
          data.file,
          data.line,
          data.workspaceRoot,
          data.start,
          data.end,
        );
      } else {
        console.error('Missing data for openFile:', data);
        vscode.window.showErrorMessage('Could not open file: Missing required information.');
      }
    });
    this._msgPipeline.on('domLoaded', () => {
      console.log('Search view DOM loaded');
      this._searchHandlers.handleDomLoaded();
      this._msgPipeline?.post('isPlatformSupported', {
        supported: this._isHaystackSupported,
      });
    });

    // Clean up when the view is disposed
    webviewView.onDidDispose(() => {
      this.stopStatusUpdates();
    });

    // Handle visibility changes
    webviewView.onDidChangeVisibility(async () => {
      await this._searchHandlers.handleVisibilityChange(this._msgPipeline!, webviewView.visible);
    });

    if (this._pendingSearchText) {
      const pendingText = this._pendingSearchText;
      this._pendingSearchText = undefined;

      // Let UI initialize first
      setTimeout(() => {
        this.searchText(pendingText);
      }, 100);
    }
  }

  /**
   * Initiates a search with the provided text in the search view
   * @param text The text to search for
   */
  public async searchText(text: string) {
    if (!this._view) {
      // Store the search text to use when the view becomes available
      // and trigger the focus command to create the view
      console.log('Search view not available, creating it first');
      this._pendingSearchText = text;
      await vscode.commands.executeCommand('haystackSearch.focus');
      return;
    }

    // Send a message to the webview to update the search input
    await this._msgPipeline!.post('setSearchText', {
      text,
    });

    // Directly trigger search using the search handlers with default options
    const defaultOptions = {
      caseSensitive: false,
      include: '',
      exclude: '',
    };

    // Use the search handlers to perform the search immediately
    await this._searchHandlers.handleSearch(this._msgPipeline!, text, defaultOptions);
  }

  /**
   * Cancels the current search in the search view
   */
  public async cancelSearch() {
    if (!this._view) {
      return;
    }
    // Cancel the search using the search handlers
    await this._searchHandlers.cancelSearch(this._msgPipeline!);
  }

  /**
   * Focuses the search input in the search view
   */
  public focusSearchInput() {
    if (!this._view) {
      // View is not available, trigger the focus command to create the view
      console.log('Search view not available, creating it first');
      vscode.commands.executeCommand('haystackSearch.focus');
      return;
    }

    // Focus the search input in the webview
    this._searchHandlers.handleFocusSearchInput(this._msgPipeline!);
  }

  public async updateStatusbar() {
    try {
      if (!this._haystackProvider || !this._haystackProvider.getHaystack()) {
        this._statusBarItem.text = `$(error) Haystack: (Not installed)`;
        this._statusBarItem.tooltip = `Haystack is not installed`;
        this._statusBarItem.show();
        return;
      }

      const status = this._haystackProvider.getHaystack()?.getStatus();
      if (status === 'initializing') {
        if (this._haystackProvider.getHaystack().getInstallStatus() === 'downloading') {
          const progress = this._haystackProvider.getHaystack().getDownloadProgress();
          if (progress.totalSize > 0) {
            this._statusBarItem.text = `$(sync~spin) Haystack: (Downloading) ${progress.percent}%`;
            this._statusBarItem.tooltip = `Haystack is downloading:\n• total: ${Math.floor((progress.totalSize / 1024 / 1024) * 100) / 100.0} MB"+
                                      "\n• downloaded: ${Math.floor((progress.downloadedSize / 1024 / 1024) * 100) / 100.0} MB`;
          } else {
            this._statusBarItem.text = `$(sync~spin) Haystack: (Downloading) ${Math.floor((progress.downloadedSize / 1024 / 1024) * 100) / 100.0} MB`;
            this._statusBarItem.tooltip = `Haystack is downloading:\n• downloaded: ${Math.floor((progress.downloadedSize / 1024 / 1024) * 100) / 100.0} MB`;
          }
        } else {
          this._statusBarItem.text = `$(sync~spin) Haystack: (Initializing)`;
          this._statusBarItem.tooltip = `Haystack is initializing, `;
        }
        this._statusBarItem.show();
        return;
      } else if (status === 'starting') {
        const retry =
          this._haystackProvider.getHaystack().getRetryCount() > 0
            ? ` Retry: ${this._haystackProvider.getHaystack().getRetryCount()}`
            : '';
        this._statusBarItem.text = `$(sync~spin) Haystack: (Starting${retry})`;
        this._statusBarItem.tooltip = `Haystack server is starting, `;
        this._statusBarItem.show();
        return;
      } else if (status === 'unsupported') {
        this._statusBarItem.text = `$(error) Haystack: (Unsupported)`;
        this._statusBarItem.tooltip = `Haystack is not supported on your platform`;
        this._statusBarItem.show();
        return;
      } else if (status === 'error') {
        this._statusBarItem.text = `$(error) Haystack: (Error)`;
        this._statusBarItem.tooltip = `Error active haystack server, install status: ${this._haystackProvider.getHaystack()?.getInstallStatus()}`;
        this._statusBarItem.show();
        return;
      }

      if (!this._haystackProvider.getWorkspaceRoot()) {
        this._statusBarItem.text = `$(check) Haystack: (No workspace)`;
        this._statusBarItem.tooltip = `Please open a workspace to use Haystack`;
        this._statusBarItem.show();
        return;
      }

      // Get all workspace roots
      const workspaceFolders = this._haystackProvider.getWorkspaceRoots();
      let totalFiles = 0;
      for (const folder of workspaceFolders) {
        const wsStatus = await this._haystackProvider.getWorkspaceStatus(folder);
        if (wsStatus.error) {
          this._statusBarItem.text = `$(error) Haystack: (Error)`;
          this._statusBarItem.tooltip = `Error: ${wsStatus.error}`;
          this._statusBarItem.show();
        } else if (wsStatus.indexing) {
          totalFiles += wsStatus.totalFiles;
          this._statusBarItem.text = `$(sync~spin) Haystack (indexing)`;
          this._statusBarItem.tooltip = `Indexing workspace:\n• Indexed: ${totalFiles} files\nYou can search now, but the results may not be accurate`;
          this._statusBarItem.show();
        } else {
          totalFiles += wsStatus.totalFiles;
          this._statusBarItem.text = `$(check) Haystack (Ready)`;
          this._statusBarItem.tooltip = `Haystack search is ready\n• Total indexed files: ${totalFiles}\n• Status: Ready for search`;
          this._statusBarItem.show();
        }
      }
    } catch (error) {
      console.error(`Failed to update workspace status: ${error}`);
    }
  }

  private startStatusUpdates() {
    // Clear existing interval if any
    if (this._statusUpdateInterval) {
      clearInterval(this._statusUpdateInterval);
    }

    this.updateStatusbar();

    // Set up new interval (3 seconds)
    this._statusUpdateInterval = setInterval(async () => {
      await this.updateStatusbar();
    }, 3000);
  }

  private stopStatusUpdates() {
    if (this._statusUpdateInterval) {
      clearInterval(this._statusUpdateInterval);
      this._statusUpdateInterval = null;
    }
    this._statusBarItem.hide();
  }

  dispose() {
    this.stopStatusUpdates();
    this._statusBarItem.dispose();
  }
}
