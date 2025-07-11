import * as vscode from 'vscode';
import { SearchViewProvider } from './search/SearchViewProvider';
import { HaystackProvider } from './core/HaystackProvider';
import { IHaystack } from './core/IHaystack';
import { Haystack } from './core/Haystack';
import { showFunctionSymbolsQuickPick } from './search/searchFunctions';
import { showFilesSearchQuickPick } from './search/searchFiles';
import { HaystackSearchTool } from './lm-tools/HaystackSearch';
import { HaystackFilesTool } from './lm-tools/HaystackFiles';
import { HayStackForTesting } from './core/HayStackForTesting';
import { createTelemetryManager } from './monitor';
import { ITelemetryManager } from './monitor/ITelemetryManager';
import { SearchHighlightManager } from './search/SearchHighlight';
import { TELEMETRY_EVENTS } from './monitor/TelemetryEvents';

// Constants
const isDev = () =>
  process.env.VSCODE_DEBUG_MODE === 'true' ||
  process.env.IS_DEV === 'true' ||
  __dirname.includes('.vscode');

// Global state
let haystackProvider: HaystackProvider | undefined;
let searchViewProvider: SearchViewProvider | undefined;
let haystack: IHaystack | undefined;
let telemetryManager: ITelemetryManager | undefined;
let searchHighlightManager: SearchHighlightManager | undefined;

/**
 * This function is called when your extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
  console.log(`haystack is running in ${isDev() ? 'dev' : 'prod'} mode`);

  // Initialize telemetry manager first
  telemetryManager = createTelemetryManager(context);

  // Log extension activation
  telemetryManager.logUsage(TELEMETRY_EVENTS.EXTENSION_ACTIVATED);

  // Simple activation logging without version checks
  console.log('Haystack extension activated');
  if (process.env.IS_TESTING) {
    vscode.window.showInformationMessage('Haystack extension is running in testing mode');
    haystack = new HayStackForTesting();
  } else {
    // Initialize Haystack Core Manager and check installation
    haystack = new Haystack(context, true);
  }
  console.log(
    `haystack is supported on ${haystack.getCurrentPlatform()}? ${haystack.getIsSupported() ? 'yes' : 'no'}`,
  );

  // Pass necessary info to HaystackProvider if needed
  // Example: haystackProvider = new HaystackProvider(haystackCoreManager.getCorePath());
  haystackProvider = new HaystackProvider(haystack);

  // Initialize SearchHighlightManager
  searchHighlightManager = new SearchHighlightManager();
  context.subscriptions.push(searchHighlightManager);

  searchViewProvider = new SearchViewProvider(
    context,
    haystackProvider,
    haystack.getIsSupported(),
    searchHighlightManager,
  );

  // Set up document event listeners for highlight management
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && searchHighlightManager) {
        searchHighlightManager.onDocumentActivated(editor.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (searchHighlightManager) {
        editors.forEach((editor) => {
          searchHighlightManager!.onDocumentActivated(editor.document);
        });
      }
    }),
  );

  // Also apply highlights to currently visible editors on startup
  if (searchHighlightManager) {
    vscode.window.visibleTextEditors.forEach((editor) => {
      searchHighlightManager!.onDocumentActivated(editor.document);
    });
    if (vscode.window.activeTextEditor) {
      searchHighlightManager.onDocumentActivated(vscode.window.activeTextEditor.document);
    }
  }

  // Register search view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SearchViewProvider.viewType, searchViewProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  // Register command to search selected text
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.searchSelectedText', async () => {
      const editor = vscode.window.activeTextEditor;

      // focus the view first
      // This is a workaround to ensure the view is created before we try to focus it
      // This is necessary because the view may not be created yet
      // when the command is executed
      await vscode.commands.executeCommand('haystackSearch.focus');

      // No active editor
      if (!editor) {
        return;
      }

      let searchText = '';
      const selection = editor.selection;

      if (!selection.isEmpty) {
        // Use selected text if available
        searchText = editor.document.getText(selection);
      } else {
        // No selection, try word at cursor
        const wordRange = editor.document.getWordRangeAtPosition(selection.active);
        if (wordRange) {
          searchText = editor.document.getText(wordRange);
        }
      }

      // Perform search if we found text and the provider exists
      if (searchText && searchViewProvider) {
        searchViewProvider.searchText(searchText);
      }
      // If no text was found (no selection, no word at cursor),
      // the view is already focused, so nothing more to do.
    }),
  );

  // Register command to focus the search input
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.focusSearchInput', () => {
      if (searchViewProvider) {
        searchViewProvider.focusSearchInput();
      }
    }),
  );

  // Register command to sync the workspace index
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.syncWorkspace', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing Haystack index...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0 });

            try {
              // Call the sync API
              await haystackProvider?.syncWorkspace();
              await searchViewProvider?.updateStatusbar();

              progress.report({ increment: 100 });
              vscode.window.showInformationMessage('Haystack index refreshed successfully.');
            } catch (error) {
              vscode.window.showErrorMessage(`Failed to refresh Haystack index: ${error}`);
            }
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error during Haystack index refresh: ${error}`);
      }
    }),
  );

  // Register command to search function symbols
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.searchFunctionSymbols', () => {
      if (!haystackProvider) {
        vscode.window.showErrorMessage('Haystack provider not initialized');
        return;
      }

      // Get selected text from editor if any
      let initialValue: string | undefined;
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        initialValue = editor.document.getText(editor.selection);
      }

      // Show the QuickPick with initial value if selected
      showFunctionSymbolsQuickPick(haystackProvider, initialValue);
    }),
  );

  // Register command to cancel search
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.cancelSearch', () => {
      try {
        searchViewProvider?.cancelSearch();
      } catch (error) {
        vscode.window.showErrorMessage(`Error cancelling search: ${error}`);
      }
    }),
  );

  // Register command to search files
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.searchFiles', () => {
      if (!haystackProvider) {
        vscode.window.showErrorMessage('Haystack provider not initialized');
        return;
      }

      // Show the QuickPick with initial value if selected
      showFilesSearchQuickPick(haystackProvider, '');
    }),
  );

  // Register command to start Haystack server
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.startServer', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Starting Haystack server...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0 });

            try {
              // Start the server
              await haystackProvider?.getHaystack().startServer();
              await searchViewProvider?.updateStatusbar();

              progress.report({ increment: 100 });
              vscode.window.showInformationMessage('Haystack server is starting...');
            } catch (error) {
              vscode.window.showErrorMessage(`Failed to start Haystack server: ${error}`);
            }
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error starting Haystack server: ${error}`);
      }
    }),
  );

  // Register command to open settings
  context.subscriptions.push(
    vscode.commands.registerCommand('haystack.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'haystack.search');
    }),
  );

  // Function to update server running status in VS Code context
  async function updateServerConnectedContext() {
    if (!haystack) {
      return;
    }

    console.log(`Haystack connected: ${haystack.connected}`);

    await vscode.commands.executeCommand('setContext', 'haystackConnected', haystack.connected);
  }

  async function updateServerInstallContext() {
    if (!haystack) {
      return;
    }

    const installed = haystack.getInstallStatus() === 'installed';
    await vscode.commands.executeCommand('setContext', 'haystackInstalled', installed);
  }

  // Update server running status initially
  updateServerConnectedContext();

  haystack.on('install-status-change', async (_event) => {
    await updateServerInstallContext();
  });

  haystack.on('connected', async (_event) => {
    await updateServerConnectedContext();
  });

  // Delay workspace creation
  setTimeout(async () => {
    try {
      await haystackProvider?.createWorkspace();
    } catch {
      // Silent fail
    }
  }, 1000);

  // Listen for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      if (event.added.length > 0) {
        try {
          await haystackProvider?.createWorkspace();
        } catch (error) {
          console.error('Error creating workspace:', error);
        }
      }
    }),
  );

  // Add provider to subscriptions for proper cleanup
  context.subscriptions.push({
    dispose: () => {
      if (haystackProvider) {
        haystackProvider.dispose();
        haystackProvider = undefined;
      }
      if (searchViewProvider) {
        searchViewProvider.dispose();
        searchViewProvider = undefined;
      }
      // No explicit dispose needed for HaystackCoreManager currently
      haystack = undefined;
    },
  });

  context.subscriptions.push(
    vscode.lm.registerTool('haystackSearch', new HaystackSearchTool(haystackProvider)),
    vscode.lm.registerTool('haystackFiles', new HaystackFilesTool(haystackProvider)),
  );
}

export function deactivate() {
  if (haystackProvider) {
    haystackProvider.dispose();
    haystackProvider = undefined;
  }
  if (searchViewProvider) {
    searchViewProvider.dispose();
    searchViewProvider = undefined;
  }
  if (searchHighlightManager) {
    searchHighlightManager.dispose();
    searchHighlightManager = undefined;
  }
  if (telemetryManager) {
    telemetryManager.logUsage(TELEMETRY_EVENTS.EXTENSION_DEACTIVATED);
    telemetryManager.dispose();
    telemetryManager = undefined;
  }
  // No explicit deactivate needed for HaystackCoreManager currently
  haystack = undefined;
}
