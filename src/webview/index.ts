import React from 'react';
import { createRoot } from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import { App } from './views';

const root = createRoot(document.getElementById('app-root')!);
root.render(React.createElement(App, null));
