import * as vscode from 'vscode'
import * as path from 'path'
import { HaystackProvider } from '../core/HaystackProvider'

interface SymbolQuickPickItem extends vscode.QuickPickItem {
  symbolName: string
  filePath: string
  line: number
  workspaceRoot?: string
}

export function createFunctionsQuickPick(): vscode.QuickPick<vscode.QuickPickItem> {
  const quickPick = vscode.window.createQuickPick()
  quickPick.ignoreFocusOut = true

  return quickPick
}

/**
 * Create and set up a QuickPick for function symbols search
 */
export function createFunctionSymbolsQuickPick(
  haystackProvider: HaystackProvider,
): vscode.QuickPick<SymbolQuickPickItem> {
  const quickPick = vscode.window.createQuickPick<SymbolQuickPickItem>()
  quickPick.placeholder = 'Search for function symbols...'
  quickPick.ignoreFocusOut = true

  // Get current active workspace folder
  let activeWorkspaceRoot: string | undefined
  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.uri.scheme === 'file'
  ) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.window.activeTextEditor.document.uri,
    )
    if (workspaceFolder) {
      activeWorkspaceRoot = workspaceFolder.uri.fsPath
    }
  }

  if (
    !activeWorkspaceRoot &&
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    activeWorkspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath
  }

  // Handle input changes with debounce
  let debounceTimeout: NodeJS.Timeout | undefined
  quickPick.onDidChangeValue((query) => {
    if (!activeWorkspaceRoot) {
      quickPick.items = [
        {
          label: '$(error) No workspace folder open',
          description: 'Please open a workspace folder first',
          symbolName: '',
          filePath: '',
          line: 0,
        } as SymbolQuickPickItem,
      ]
      return
    }

    if (query.length < 2) {
      quickPick.items = [
        {
          label: '$(search) Type at least 2 characters to search',
          description: 'Search for function symbols in the workspace',
          symbolName: '',
          filePath: '',
          line: 0,
        } as SymbolQuickPickItem,
      ]
      return
    }

    // Clear previous timeout
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    // Set busy indicator
    quickPick.busy = true
    // Debounce the input
    debounceTimeout = setTimeout(async () => {
      try {
        // Show status message indicating search is in progress
        showStatusMessage(`$(search~spin) Searching for symbols: ${query}...`)

        const response = await haystackProvider.searchSymbols(activeWorkspaceRoot!, query)
        if (response.code === 200 && response.data) {
          const items: SymbolQuickPickItem[] = []
          for (const symbol of response.data.symbols) {
            for (const file of symbol.files) {
              // Format label with icon based on type of symbol
              const label = `$(symbol-function) ${symbol.name}`

              // Show file location and line number in the description
              const fileBaseName = path.basename(file.path)
              const description = `${fileBaseName}:${file.line}`

              // The detailed path for additional context
              const detail = file.path
              items.push({
                label,
                description,
                detail,
                symbolName: symbol.name,
                filePath: file.path,
                line: file.line,
                workspaceRoot: activeWorkspaceRoot,
                alwaysShow: true,
              })
            }
          }

          // Sort items by symbol name and then by file path
          /*
          items.sort((a, b) => {
            // First sort by symbol name
            const nameCompare = a.symbolName.localeCompare(b.symbolName);
            if (nameCompare !== 0) {
              return nameCompare;
            }
            // Then by file path
            return a.filePath.localeCompare(b.filePath);
          });
          */
          if (items.length > 0) {
            quickPick.items = items
            // Show success status message with count
            showStatusMessage(
              `$(symbol-function) Found ${items.length} symbol${items.length === 1 ? '' : 's'}`,
            )
          } else {
            quickPick.items = [
              {
                label: '$(info) No matching symbols found',
                description: 'Try a different search query',
                symbolName: '',
                filePath: '',
                line: 0,
              } as SymbolQuickPickItem,
            ]
            // Show no results status message
            showStatusMessage(`$(warning) No symbols found matching "${query}"`)
          }
        } else {
          // Handle error
          const errorMessage = response.message || 'Unknown error'
          // Show error in status bar
          showStatusMessage(`$(error) API Error: ${errorMessage}`, 5000)
          quickPick.items = [
            {
              label: `$(error) Error: ${errorMessage}`,
              symbolName: '',
              filePath: '',
              line: 0,
            } as SymbolQuickPickItem,
          ]
        }
      } catch (error) {
        console.error('Error searching symbols:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        // Show error status message
        showStatusMessage(`$(error) Error searching symbols: ${errorMessage}`, 5000)
        quickPick.items = [
          {
            label: `$(error) Error: ${errorMessage}`,
            symbolName: '',
            filePath: '',
            line: 0,
          } as SymbolQuickPickItem,
        ]
      } finally {
        quickPick.busy = false
      }
    }, 300) // 300ms debounce
  })

  // Handle selection
  quickPick.onDidAccept(async () => {
    const selectedItem = quickPick.selectedItems[0]
    if (selectedItem && selectedItem.filePath) {
      try {
        // Open the file
        const fileUri = vscode.Uri.file(
          path.join(selectedItem.workspaceRoot || '', selectedItem.filePath),
        )
        const document = await vscode.workspace.openTextDocument(fileUri)
        const editor = await vscode.window.showTextDocument(document)
        // Jump to position if line available
        if (selectedItem.line > 0) {
          const position = new vscode.Position(selectedItem.line - 1, 0)
          editor.selection = new vscode.Selection(position, position)
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter,
          )
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    quickPick.hide()
  })

  return quickPick
}

/**
 * Create and show a QuickPick for searching function symbols with initial value
 * @param haystackProvider The Haystack provider
 * @param initialValue Optional initial search query
 */
export function showFunctionSymbolsQuickPick(
  haystackProvider: HaystackProvider,
  initialValue?: string,
): void {
  const quickPick = createFunctionSymbolsQuickPick(haystackProvider)
  quickPick.show()

  // Set initial value if provided
  if (initialValue) {
    quickPick.value = initialValue
  }
}

/**
 * Shows a status message with an optional timeout
 */
function showStatusMessage(message: string, timeout = 3000): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBarItem.text = message
  statusBarItem.show()

  setTimeout(() => {
    statusBarItem.hide()
    statusBarItem.dispose()
  }, timeout)
}
