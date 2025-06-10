import { MessageWrapper } from './common';
import type { ExtensionMessageTypes } from './extension';
import type { SearchContentResult } from '../types/search';

export interface SearchResultStream {
  result: SearchContentResult;
  workspaceRoot: string;
  workspaceName: string;
  truncated?: boolean;
  isDone: false;
}

export interface SearchResultWithoutData {
  workspaceRoot?: string;
  workspaceName?: string;
  truncated: boolean;
  isDone: true;
}

// This file defines the common interfaces and types used for message communication.
// key: message type
// value: data type for the message
// when don't need data, use `never` as the type
export type WebviewMessageTypes = {
  setSearchText: {
    text: string;
  };
  searchStarted: {
    query: string;
    workspaces: Array<{
      name: string;
      path: string;
    }>;
  };
  searchResultStream: SearchResultStream | SearchResultWithoutData;
  searchCancelled: never;
  focusSearchInput: never;
  visibilityChanged: {
    isVisible: boolean;
  };
  isPlatformSupported: {
    supported: boolean;
  };
};

export class WebViewMessagePipeline extends MessageWrapper<
  WebviewMessageTypes,
  ExtensionMessageTypes
> {}
