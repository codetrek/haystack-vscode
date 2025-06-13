import React from 'react';
import { useSearch, useSearchInputFocus, useCancelSearch } from './hooks';
import { SearchTermInput } from './SearchTermInput';
import { usePipeMsg } from '../../msgPipe/msgPipe';
import { resetResult } from '../../store/result';
import { SearchOptions } from './SearchOptions';
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
      doSearch(true);
    }
  });
  usePipeMsg('setSearchText', (message) => {
    state.searchTerm = message.text;
    // extension side has started a search, so we set loading state
    focusSearchInput();
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
