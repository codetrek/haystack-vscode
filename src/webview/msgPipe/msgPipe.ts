import React, { createContext, useContext, ReactNode } from 'react';
import { WebViewMessagePipeline, type WebviewMessageTypes } from '@/message/webview';
import type { ExtensionMessageTypes } from '../../message/extension';
import { listenerExtensionMessages } from './listener';

// since vscode does not provide acquireVsCodeApi type, we need to declare it
declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => Thenable<boolean>;
};

// Types for dependency injection
export interface VsCodeApi {
  postMessage: (message: unknown) => Thenable<boolean>;
}

export interface WindowApi {
  addEventListener: (event: 'message', listener: (event: { data: unknown }) => void) => void;
  removeEventListener: (event: 'message', listener: (event: { data: unknown }) => void) => void;
}

// Factory function to create message pipeline with dependencies
export function createMsgPipe(
  vsCodeApi?: VsCodeApi,
  windowApi?: WindowApi,
): WebViewMessagePipeline {
  const api = vsCodeApi || (typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null);
  // @ts-ignore
  const win = windowApi || (typeof window !== 'undefined' ? window : null);

  if (!api || !win) {
    throw new Error('VSCode API or Window API not available');
  }

  return new WebViewMessagePipeline(api, win);
}

// Configuration interface for message pipeline setup
export interface MsgPipeConfig {
  msgPipe?: WebViewMessagePipeline;
  enableGlobalHandlers?: boolean;
}

// Create a configurable context
const MsgPipeContext = createContext<WebViewMessagePipeline | null>(null);

/**
 * Provider component that makes the message pipeline available to child components
 * @param config Configuration object containing msgPipe instance and options
 */
export const MsgPipeProvider: React.FC<{
  children: ReactNode;
  config?: MsgPipeConfig;
}> = ({ children, config = {} }) => {
  const { msgPipe: providedMsgPipe, enableGlobalHandlers = true } = config;
  const pipeInstance = React.useMemo(() => providedMsgPipe || createMsgPipe(), [providedMsgPipe]);
  React.useEffect(() => {
    if (!enableGlobalHandlers || !pipeInstance) return;
    return listenerExtensionMessages(pipeInstance);
  }, [pipeInstance, enableGlobalHandlers]);

  return React.createElement(MsgPipeContext.Provider, { value: pipeInstance }, children);
};

/**
 * Hook to access the message pipeline from React components
 * @returns The WebViewMessagePipeline instance
 * @throws Error if used outside of MsgPipeProvider
 */
export const useMsgPipe = () => {
  const msgPipe = useContext(MsgPipeContext);
  if (!msgPipe) {
    throw new Error('useMsgPipe must be used within a MsgPipeProvider');
  }
  return msgPipe;
};

/**
 * Custom hook to subscribe to messages from the webview
 * @param event
 * @param callback
 */
export const usePipeMsg = <E extends keyof WebviewMessageTypes>(
  event: E,
  callback: (data: WebviewMessageTypes[E]) => void,
) => {
  const msgPipe = useMsgPipe();
  React.useEffect(() => {
    const handler = (data: WebviewMessageTypes[E]) => callback(data);
    const disposable = msgPipe.on(event, handler);
    return () => {
      disposable.dispose();
    };
  }, [msgPipe, event, callback]);
};

/**
 * Custom hook to send messages to the webview
 */
export const useSendPipeMsg = () => {
  const msgPipe = useMsgPipe();
  return React.useCallback(
    <E extends keyof ExtensionMessageTypes>(
      event: E,
      ...args: ExtensionMessageTypes[E] extends never ? [] : [data: ExtensionMessageTypes[E]]
    ) => {
      return msgPipe.post(event, ...args);
    },
    [msgPipe],
  );
};
