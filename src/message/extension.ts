import { MessageWrapper } from './common';
import type { WebviewMessageTypes } from './webview';
import type { SearchMessage } from '../types/search';

// define the types for extension can receive messages
// key: message type
// value: data type for the message
// when don't need data, use `never` as the type
export type ExtensionMessageTypes = {
  search: {
    query: string;
    options: SearchMessage['options'];
  };
  cancelSearch: never;
  openFile: {
    file: string;
    workspaceRoot: string;
    line: number;
    start?: number;
    end?: number;
  };
  domLoaded: never;
};

export class ExtensionMessagePipeline extends MessageWrapper<
  ExtensionMessageTypes,
  WebviewMessageTypes
> {}
