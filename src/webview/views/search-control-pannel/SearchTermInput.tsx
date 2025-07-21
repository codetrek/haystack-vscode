import React from 'react';
import { useSnapshot } from 'valtio';
import { state } from './state';
import { useCombinedRef } from '../../hooks/useCombinedRef';

export interface SearchTermInputProps {
  onClear?: () => void;
  onSensitiveToggle?: () => void;
  onWholeWordToggle?: () => void;
  ref?: React.Ref<HTMLInputElement>;
}

export const SearchTermInput: React.FC<SearchTermInputProps> = ({
  onClear,
  onSensitiveToggle,
  onWholeWordToggle,
  ref,
}) => {
  const snap = useSnapshot(state, { sync: true });
  const searchInputRef = useCombinedRef<HTMLInputElement>(ref);

  function handleOnClear() {
    if (searchInputRef.current) {
      state.searchTerm = '';
      searchInputRef.current.focus();
      onClear?.();
    }
  }

  function handleOnSearchTextChange(event: React.ChangeEvent<HTMLInputElement>) {
    state.searchTerm = event.target.value;
  }

  function handleOnSensitiveToggle() {
    state.caseSensitive = !snap.caseSensitive;
    onSensitiveToggle?.();
  }

  function handleOnWholeWordToggle() {
    state.wholeWord = !snap.wholeWord;
    onWholeWordToggle?.();
  }

  function handleOnOptionsToggle() {
    state.showOptions = !snap.showOptions;
  }

  return (
    <div className="search-input-container">
      <input
        ref={searchInputRef.ref}
        type="text"
        className="search-input"
        placeholder="Search in files..."
        id="searchInput"
        autoFocus
        value={snap.searchTerm}
        onChange={handleOnSearchTextChange}
      />
      {snap.searchTerm && (
        <div
          className="codicon codicon-close search-option-button input-option-button clear-button"
          id="clearTextBtn"
          title="Clear search text"
          onClick={handleOnClear}
        />
      )}
      <div
        className={`codicon codicon-case-sensitive search-option-button input-option-button ${snap.caseSensitive ? 'active' : ''}`}
        id="caseSensitiveBtn"
        title="Case sensitive"
        onClick={handleOnSensitiveToggle}
      />
      <div
        className={`codicon codicon-whole-word search-option-button input-option-button ${snap.wholeWord ? 'active' : ''}`}
        id="wholeWordBtn"
        title="Whole word"
        onClick={handleOnWholeWordToggle}
      />
      <div
        className={`search-options-toggle ${snap.showOptions ? 'active' : ''}`}
        id="optionsToggle"
        onClick={handleOnOptionsToggle}
      >
        ⋮
      </div>
    </div>
  );
};
