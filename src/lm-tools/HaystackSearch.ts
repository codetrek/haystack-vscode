import { HaystackProvider } from '@/core/HaystackProvider';
import { SearchContentResult } from '@/types/search';
import * as vscode from 'vscode';
import { StringBuilder } from './StringBuilder';

interface HaystackSearchToolInput {
  query: string;
  workspace: string;
  path?: string;
  filter?: string;
  exclude?: string;
  limit?: number;
}

export class HaystackSearchTool implements vscode.LanguageModelTool<HaystackSearchToolInput> {
  constructor(private readonly haystackProvider: HaystackProvider) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<HaystackSearchToolInput>,
    _cancellationToken: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const confirmationMessages = {
      title: 'Haystack Search (File Contents)',
      message: new vscode.MarkdownString(`Search \`${options.input.query}\` for file contents`),
    };

    return {
      invocationMessage: 'Search file contents with Haystack',
      confirmationMessages,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<HaystackSearchToolInput>,
    _cancellationToken: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    let results: SearchContentResult[] = [];
    await this.haystackProvider.searchStream(
      options.input.query,
      {
        workspaceRoot: options.input.workspace,
        path: options.input.path,
        include: options.input.filter,
        exclude: options.input.exclude,
        maxResults: options.input.limit || 500,
        maxResultsPerFile: 50,
        beforeAfter: 1,
      },
      /* eslint-disable-line require-await -- callback expects a Promise */ async (result) => {
        results.push(result);
      },
    );

    const truncated = results.some((r) => r.truncate);
    results = results.filter((r) => r.file);
    const totalFiles = results.length;
    const totalResults = results.reduce((sum, r) => sum + (r.lines?.length ?? 0), 0);

    const result = new StringBuilder();
    result.appendLine(
      `Found ${totalResults} results in ${totalFiles} files ${truncated ? '(truncated)' : ''}:`,
    );
    for (const file of results) {
      result.appendLine();

      const lines = file.lines ?? [];
      result.appendLine('====================');
      result.appendLine(`File: ${file.file}, ${lines.length} result(s)`);
      result.appendLine('====================');

      // Optimization: Don't show duplicated lines.

      const linesToDisplay = new Map<number, string>();
      for (const { line, before, after } of lines) {
        linesToDisplay.set(line.line_number, line.content);
        for (const adjencyLine of [...(before ?? []), ...(after ?? [])]) {
          linesToDisplay.set(adjencyLine.line_number, adjencyLine.content);
        }
      }
      const lineNumberWidth = Math.max(
        ...Array.from(linesToDisplay.keys()).map((num) => num.toString().length),
      );

      const sortedLines = Array.from(linesToDisplay.entries()).sort((a, b) => a[0] - b[0]);
      let lastLineNumber = 0;
      for (const [lineNumber, content] of sortedLines) {
        if (lastLineNumber && lastLineNumber !== lineNumber - 1) {
          result.appendLine(`... (${lineNumber - lastLineNumber - 1} lines omitted)`);
        }
        result.appendLine(`Line ${lineNumber.toString().padStart(lineNumberWidth)}: ${content}`);
        lastLineNumber = lineNumber;
      }
    }

    return result.toLanguageModelToolResult();
  }
}
