import vscode from 'vscode';
import { readFileSync } from "fs";
import path from 'path';

const localServer = "http://localhost:9000";

export function getSearchTemplate(context: vscode.ExtensionContext, webview: vscode.Webview, isHaystackSupported: boolean) {
  const nonce = getNonce();

  const localJsFile = webview.asWebviewUri(
    vscode.Uri.parse(`${localServer}/webview.js`)
  );

  let scriptUrl = [];

  const isProd = context.extensionMode === vscode.ExtensionMode.Production;
  if (isProd) {
    // Get the manifest file from the dist folder
    const manifest = readFileSync(
      path.join(context.extensionUri.fsPath, "dist", "webview", "manifest.json"),
      "utf-8"
    );
    const manifestJson = JSON.parse(manifest);
    for (const [key, value] of Object.entries<string>(manifestJson)) {
      if (key.endsWith(".js")) {
        scriptUrl.push(webview.asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, "dist", "webview", value)
        ).toString()
        );
      }
    }
  } else {
    scriptUrl.push(localJsFile);
  }

  // Set CSP (Content Security Policy)
  const devExtraCsp = isProd
    ? ''
    : `http://localhost:9000`;
  const csp = `
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src ${webview.cspSource} 'nonce-${nonce}' ${devExtraCsp};
        font-src ${webview.cspSource} ${devExtraCsp};
        connect-src 'self' https: ws: ${devExtraCsp};
    `;

  // Conditionally add the warning message
  const platformWarning = !isHaystackSupported
    ? `<div class="platform-warning">Haystack does not support your current platform (${process.platform}-${process.arch}). Search may not work correctly.</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="${csp}">
      <title>Haystack Search</title>
    </head>
    <body>
      <div class="search-container">
        ${platformWarning}
        <div class="search-input-container">
          <input type="text" class="search-input" placeholder="Search in files..." id="searchInput" autofocus>
          <button class="search-option-button input-option-button clear-button" id="clearTextBtn" title="Clear search text" style="display: none;">✕</button>
          <button class="search-option-button input-option-button" id="caseSensitiveBtn" title="Case sensitive">Aa</button>
          <button class="search-options-toggle" id="optionsToggle">⋮</button>
        </div>
        <div class="search-options" id="searchOptions">
          <div class="search-option">
            <input type="text" class="search-input" id="includeFiles" placeholder="Files to include (e.g. *.ts,core/*)">
          </div>
          <div class="search-option">
            <input type="text" class="search-input" id="excludeFiles" placeholder="Files to exclude">
          </div>
        </div>
        <div class="search-results" id="searchResults"></div>
      </div>
      ${scriptUrl.map((url) => `<script src="${url}" nonce="${nonce}" crossorigin="anonymous"></script>`).join("\n")}
    </body>
    </html>
  `;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}