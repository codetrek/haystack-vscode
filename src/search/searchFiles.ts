import * as vscode from 'vscode';
import * as path from 'path';
import { HaystackProvider } from '../core/HaystackProvider';
import { fuzzyMatchScore } from './utils';
import { TELEMETRY_CONSTANTS } from '@/monitor/TelemetryConstant';

interface FileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  workspaceRoot?: string;
}

/**
 * Create and set up a QuickPick for file search
 */
export function createFilesSearchQuickPick(
  haystackProvider: HaystackProvider,
): vscode.QuickPick<FileQuickPickItem> {
  const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  quickPick.placeholder = 'Search for files...';

  // Get current active workspace folder
  let activeWorkspaceRoot: string | undefined;
  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.uri.scheme === 'file'
  ) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.window.activeTextEditor.document.uri,
    );
    if (workspaceFolder) {
      activeWorkspaceRoot = workspaceFolder.uri.fsPath;
    }
  }

  if (
    !activeWorkspaceRoot &&
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    activeWorkspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  // Handle input changes with debounce
  let debounceTimeout: NodeJS.Timeout | undefined;
  quickPick.onDidChangeValue((query) => {
    if (!activeWorkspaceRoot) {
      quickPick.items = [
        {
          label: '$(error) No workspace folder open',
          description: 'Please open a workspace folder first',
          filePath: '',
        } as FileQuickPickItem,
      ];
      return;
    }

    if (query.length < 2) {
      quickPick.items = [
        {
          label: '$(search) Type at least 2 characters to search',
          description: 'Search for files in the workspace',
          filePath: '',
        } as FileQuickPickItem,
      ];
      return;
    }

    // Clear previous timeout
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    // Set busy indicator
    quickPick.busy = true;
    // Debounce the input
    debounceTimeout = setTimeout(async () => {
      try {
        // Show status message indicating search is in progress
        showStatusMessage(`$(search~spin) Searching for files: ${query}...`);

        const workspaces = haystackProvider.getWorkspaceRoots();
        const items: FileQuickPickItem[] = [];
        for (const workspace of workspaces) {
          const response = await haystackProvider.searchFiles(
            workspace,
            query,
            TELEMETRY_CONSTANTS.DEFAULT_FILE_SEARCH_MAX_RESULTS,
            TELEMETRY_CONSTANTS.TELEMETRY_SOURCE_MANUAL,
          );
          if (response.code !== 200 || !response.data || !response.data.results) {
            continue;
          }

          for (const filePath of response.data.results) {
            // Format label with icon based on type of file
            const fileIcon = getIconForFile(filePath);
            const label = `${fileIcon} ${path.basename(filePath)}`;

            // Show file location
            const relativePath = getRelativePath(filePath);
            const description =
              (workspaces.length > 1 ? path.basename(workspace) + '·' : '') + relativePath;

            items.push({
              label,
              description,
              // detail: filePath,
              filePath,
              workspaceRoot: workspace,
              alwaysShow: true,
            });
          }
        }

        if (items.length > 0) {
          items.sort((a, b) => {
            const scoreA = fuzzyMatchScore(query, a.filePath);
            const scoreB = fuzzyMatchScore(query, b.filePath);
            return scoreB - scoreA;
          });

          quickPick.items = items;
          // Show success status message with count
          showStatusMessage(`$(files) Found ${items.length} file${items.length === 1 ? '' : 's'}`);
        } else {
          quickPick.items = [
            {
              label: '$(info) No matching files found',
              description: 'Try a different search query',
              filePath: '',
            } as FileQuickPickItem,
          ];
          // Show no results status message
          showStatusMessage(`$(warning) No files found matching "${query}"`);
        }
      } catch (error) {
        console.error('Error searching files:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Show error status message
        showStatusMessage(`$(error) Error searching files: ${errorMessage}`, 5000);
        quickPick.items = [
          {
            label: `$(error) Error: ${errorMessage}`,
            filePath: '',
          } as FileQuickPickItem,
        ];
      } finally {
        quickPick.busy = false;
      }
    }, 300); // 300ms debounce
  });

  // Handle selection
  quickPick.onDidAccept(async () => {
    const selectedItem = quickPick.selectedItems[0];
    if (selectedItem && selectedItem.filePath) {
      try {
        // Open the file
        const fileUri = vscode.Uri.file(
          path.join(selectedItem.workspaceRoot || '', selectedItem.filePath),
        );
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    quickPick.hide();
  });

  return quickPick;
}

/**
 * Create and show a QuickPick for searching files with initial value
 * @param haystackProvider The Haystack provider
 * @param initialValue Optional initial search query
 */
export function showFilesSearchQuickPick(
  haystackProvider: HaystackProvider,
  initialValue?: string,
): void {
  const quickPick = createFilesSearchQuickPick(haystackProvider);
  quickPick.show();

  // Set initial value if provided
  if (initialValue) {
    quickPick.value = initialValue;
  }
}

/**
 * Get an appropriate icon for a file based on its extension or path
 */
function getIconForFile(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  // File icons based on extension
  switch (extension) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return '$(json)';
    case '.html':
    case '.htm':
      return '$(code)';
    case '.css':
    case '.scss':
    case '.less':
      return '$(symbol-color)';
    case '.json':
      return '$(json)';
    case '.md':
      return '$(symbol-numeric)';
    case '.py':
      return '$(python)';
    case '.cpp':
    case '.cc':
      return '$(type-hierarchy-sub)';
    case '.c':
    case '.h':
    case '.hpp':
      return '$(file-code)';
    case '.go':
      return '$(file-code)';
    case '.rs':
      return '$(file-code)';
    case '.java':
      return '$(symbol-class)';
    default:
      return '$(file)';
  }
}

/**
 * Get a friendly relative path representation for display
 */
function getRelativePath(filePath: string): string {
  // Extract directory path and display it in a friendly way
  const dirPath = path.dirname(filePath);

  // If it's a root path or a shallow path, just return it
  if (dirPath === '.' || dirPath.split(path.sep).length <= 1) {
    return dirPath;
  }

  // Otherwise, format it for display
  return dirPath;
}

/**
 * Shows a status message with an optional timeout
 */
function showStatusMessage(message: string, timeout = 3000): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = message;
  statusBarItem.show();

  setTimeout(() => {
    statusBarItem.hide();
    statusBarItem.dispose();
  }, timeout);
}
