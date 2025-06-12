import * as vscode from 'vscode';

export class StringBuilder {
  constructor(private s = '') {}

  appendLine(line = ''): this {
    this.s += line + '\n';
    return this;
  }

  toString(): string {
    return this.s.trimEnd();
  }

  toLanguageModelToolResult(): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(this.toString())]);
  }
}
