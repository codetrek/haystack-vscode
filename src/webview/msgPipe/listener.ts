import { WebViewMessagePipeline } from '../../message/webview';
import {
  isLoading,
  setSearchCancelled,
  setSearchDone,
  setSearchLoading,
  setSearchStream,
} from '../store/result';
import { setPlatformSupport } from '../store/support';

export function listenerExtensionMessages(pipeInstance: WebViewMessagePipeline): () => void {
  // Setup global message handlers
  const disposables = [
    pipeInstance.on('searchResultStream', (data) => {
      if (!isLoading()) {
        console.error('Received search result stream while not loading:', data);
        return;
      }
      if (data.isDone) {
        setSearchDone(data.truncated);
      } else if (data.result?.file) {
        setSearchStream(data);
      }
    }),

    pipeInstance.on('searchCancelled', () => {
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
