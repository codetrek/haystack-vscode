import { HaystackProvider } from '@/core/HaystackProvider';
import { TELEMETRY_CONSTANTS } from '@/monitor/TelemetryConstant';
import * as vscode from 'vscode';
import { StringBuilder } from './StringBuilder';

interface HaystackFilesToolInput {
  query: string;
  workspace: string;
  path?: string;
  limit?: number;
}

export class HaystackFilesTool implements vscode.LanguageModelTool<HaystackFilesToolInput> {
  constructor(private readonly haystackProvider: HaystackProvider) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<HaystackFilesToolInput>,
    _cancellationToken: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const confirmationMessages = {
      title: 'Haystack Search (File Paths)',
      message: new vscode.MarkdownString(`Search \`${options.input.query}\` for file paths`),
    };

    return {
      invocationMessage: 'Search file paths with Haystack',
      confirmationMessages,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<HaystackFilesToolInput>,
    _cancellationToken: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const response = await this.haystackProvider.searchFiles(
      options.input.workspace,
      options.input.query,
      options.input.limit || 500,
      TELEMETRY_CONSTANTS.FILE_SEARCH_AI_TOOL,
    );
    if (response.code !== 200) {
      return new StringBuilder(
        `Error from Haystack IPC remote: code = ${response.code}, message = ${JSON.stringify(response.message)}`,
      ).toLanguageModelToolResult();
    }

    const results = response.data?.results ?? [];

    const result = new StringBuilder();
    result.appendLine(`Found ${results.length} files:`);
    if (results.length === 0) {
      result.appendLine('No results found.');
    }
    for (const file of results) {
      result.appendLine(file);
    }

    return result.toLanguageModelToolResult();
  }
}
