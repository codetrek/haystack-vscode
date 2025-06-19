import { WebViewMessagePipeline, type SearchResultStream } from '../../message/webview';
import {
  isLoading,
  setSearchCancelled,
  setSearchDone,
  setSearchLoading,
  setSearchStream,
} from '../store/result';
import { setPlatformSupport } from '../store/support';
import { throttle } from '../utils';

// Throttled version of setSearchStream that processes batched updates
const throttledSetSearchStream = throttle<SearchResultStream>((dataArray) => {
  dataArray.forEach((data) => {
    setSearchStream(data);
  });
}, 50);

export function listenerExtensionMessages(pipeInstance: WebViewMessagePipeline): () => void {
  // Setup global message handlers
  const disposables = [
    pipeInstance.on('searchResultStream', (data) => {
      if (!isLoading()) {
        console.error('Received search result stream while not loading:', data);
        return;
      }
      if (data.isDone) {
        // Flush any pending data before marking search as done
        throttledSetSearchStream.flush();
        setSearchDone(data.truncated);
      } else if (data.result?.file) {
        throttledSetSearchStream(data);
      }
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
