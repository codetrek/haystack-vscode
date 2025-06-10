import React from 'react';
import { resetResult, setSearchLoading, hasResults } from '../../store/result';
import { useSearch, useSearchInputFocus, useCancelSearch } from './hooks';
import { SearchTermInput } from './SearchTermInput';
import { SearchOptions } from './SearchOptions';
import { usePipeMsg } from '../../msgPipe';
import { state } from './state';

export const SearchControlPanel: React.FC = () => {
  const ref = React.useRef<HTMLInputElement | null>(null);
  const focusSearchInput = useSearchInputFocus(ref);
  const cancelSearch = useCancelSearch();
  const doSearch = useSearch();

  usePipeMsg('focusSearchInput', focusSearchInput);
  usePipeMsg('visibilityChanged', (message) => {
    if (message.isVisible) {
      focusSearchInput();
      if (!hasResults()) {
        doSearch();
      }
    }
  });
  usePipeMsg('setSearchText', (message) => {
    state.searchTerm = message.text;
    // extension side has started a search, so we set loading state
    focusSearchInput();
    setSearchLoading();
  });

  const onClearSearch = () => {
    cancelSearch();
    resetResult();
  };

  const onSensitiveToggle = () => {
    resetResult();
    doSearch();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      doSearch();
    } else if (event.key === 'Escape') {
      cancelSearch();
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <SearchTermInput onClear={onClearSearch} onSensitiveToggle={onSensitiveToggle} ref={ref} />
      <SearchOptions />
    </div>
  );
};
