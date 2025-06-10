import React, { createContext, useContext, ReactNode } from 'react';
import { WebViewMessagePipeline, type WebviewMessageTypes } from '@/message/webview';
import { setSearchCancelled, setSearchDone, setSearchStream, isLoading } from './store/result';
import { support } from './store/support';
import type { ExtensionMessageTypes } from '../message/extension';

// since vscode does not provide acquireVsCodeApi type, we need to declare it
declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => Thenable<boolean>;
};

export const msgPipe = new WebViewMessagePipeline(acquireVsCodeApi(), window);

const MsgPipeContext = createContext<WebViewMessagePipeline>(msgPipe);
/**
 * Provider component that makes the message pipeline available to child components
 */
export const MsgPipeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return React.createElement(MsgPipeContext.Provider, { value: msgPipe }, children);
};

/**
 * Hook to access the message pipeline from React components
 * @returns The WebViewMessagePipeline instance
 * @throws Error if used outside of MsgPipeProvider
 */
export const useMsgPipe = () => {
  return useContext(MsgPipeContext);
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

msgPipe.on('searchResultStream', (data) => {
  if (!isLoading()) {
    console.error('Received search result stream while not loading:', data);
    return;
  }
  if (data.isDone) {
    setSearchDone(data.truncated);
  } else if (data.result?.file) {
    setSearchStream(data);
  }
});

msgPipe.on('searchCancelled', () => {
  setSearchCancelled();
});

msgPipe.on('isPlatformSupported', ({ supported }) => {
  support.isPlatformSupported = supported;
});
