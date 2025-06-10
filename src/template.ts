import vscode from 'vscode';
import { readFileSync } from 'fs';
import path from 'path';

const localServer = 'http://localhost:9000';

export function getSearchTemplate(context: vscode.ExtensionContext, webview: vscode.Webview) {
  const nonce = getNonce();

  const localJsFile = webview
    .asWebviewUri(vscode.Uri.parse(`${localServer}/webview.js`))
    .toString();

  const scriptUrl: string[] = [];

  const isProd = context.extensionMode === vscode.ExtensionMode.Production;
  if (isProd) {
    // Get the manifest file from the dist folder
    const manifest = readFileSync(
      path.join(context.extensionUri.fsPath, 'dist', 'webview', 'manifest.json'),
      'utf-8',
    );
    const manifestJson = JSON.parse(manifest);
    for (const [key, value] of Object.entries<string>(manifestJson)) {
      if (key.endsWith('.js')) {
        scriptUrl.push(
          webview
            .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', value))
            .toString(),
        );
      }
    }
  } else {
    scriptUrl.push(localJsFile);
  }

  // Set CSP (Content Security Policy)
  const devExtraCsp = isProd ? '' : localServer;
  const csp = `
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src ${webview.cspSource} 'nonce-${nonce}' ${devExtraCsp};
        font-src ${webview.cspSource} ${devExtraCsp};
        connect-src 'self' https: ws: ${devExtraCsp};
    `;

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
      <div id="app-root"></div>
      ${scriptUrl.map((url) => `<script src="${url}" nonce="${nonce}" crossorigin="anonymous"></script>`).join('\n')}
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
