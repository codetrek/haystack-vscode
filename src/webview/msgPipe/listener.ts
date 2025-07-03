import { WebViewMessagePipeline, type UpdateResultData } from '../../message/webview';
import {
  setSearchCancelled,
  setSearchDone,
  setSearchLoading,
  setSearchStream,
} from '../store/result';
import { setPlatformSupport } from '../store/support';
import { throttle } from '../utils';

// Throttled version of setSearchStream that processes batched updates
const throttledSetSearchStream = throttle<UpdateResultData>((dataArray) => {
  dataArray.forEach((data) => {
    setSearchStream({
      result: data.result,
      workspaceRoot: data.workspaceRoot,
      workspaceName: data.workspaceName,
    });
  });
}, 50);

export function listenerExtensionMessages(pipeInstance: WebViewMessagePipeline): () => void {
  // Setup global message handlers
  const disposables = [
    pipeInstance.on('updateResult', (data) => {
      // Allow updating results even after search is done (for research functionality)
      if (data.result?.file) {
        throttledSetSearchStream(data);
      }
    }),

    pipeInstance.on('searchDone', (data) => {
      // Flush any pending data before marking search as done
      throttledSetSearchStream.flush();
      setSearchDone(data.truncated);
    }),

    pipeInstance.on('searchCancelled', () => {
      // Flush any pending data before cancelling search
      throttledSetSearchStream.flush();
      setSearchCancelled();
    }),

    pipeInstance.on('isPlatformSupported', ({ supported }) => {
      setPlatformSupport(supported);
    }),

    pipeInstance.on('setSearchText', handleSetSearchTextMessage),
  ];

  return () => {
    disposables.forEach((disposable) => disposable.dispose());
  };
}

/**
 * extension side has started a search, so we only need to set loading state
 */
export function handleSetSearchTextMessage() {
  setSearchLoading();
}

// export function handleVisibilityChangedMessage(isVisible: boolean) {
//   doSearch();
//   if (isVisible && !hasResults()) {
//     setSearchLoading();
//   }
// }
