import { type ExtensionMessageTypes } from '../../message/extension';
import { type WebViewMessagePipeline } from '../../message/webview';
import { hasResults, isLoading, setSearchLoading } from '../store/result';

export function doSearch(
  sender: WebViewMessagePipeline['post'],
  query: string,
  options: ExtensionMessageTypes['search']['options'],
  noResults: boolean, // if true, do not start a new search if there are already results
) {
  // If we are already loading, we should not start a new search
  if (isLoading()) {
    return;
  }
  if (noResults && hasResults()) {
    return;
  }
  setSearchLoading();
  sender('search', {
    query,
    options,
  });
}

export function cancelSearch(sender: WebViewMessagePipeline['post']) {
  // Always send cancelSearch message to clear highlights, regardless of loading state
  sender('cancelSearch');
}
