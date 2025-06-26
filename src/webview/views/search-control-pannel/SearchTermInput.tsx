import React, { useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { state } from './state';
import { useCombinedRef } from '../../hooks/useCombinedRef';

export interface SearchTermInputProps {
  onClear?: () => void;
  onSensitiveToggle?: () => void;
  ref?: React.Ref<HTMLInputElement>;
}

export const SearchTermInput: React.FC<SearchTermInputProps> = ({
  onClear,
  onSensitiveToggle,
  ref,
}) => {
  const snap = useSnapshot(state);
  const [text, setText] = React.useState(snap.searchTerm);
  const searchInputRef = useCombinedRef<HTMLInputElement>(ref);
  useEffect(() => {
    state.searchTerm = text;
  }, [text]);

  function handleOnClear() {
    if (searchInputRef.current) {
      setText('');
      searchInputRef.current.focus();
      onClear?.();
    }
  }

  function handleOnSearchTextChange(event: React.ChangeEvent<HTMLInputElement>) {
    setText(event.target.value);
  }

  function handleOnSensitiveToggle() {
    state.caseSensitive = !snap.caseSensitive;
    onSensitiveToggle?.();
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
        value={text}
        onChange={handleOnSearchTextChange}
      />
      {snap.searchTerm && (
        <button
          className="search-option-button input-option-button clear-button"
          id="clearTextBtn"
          title="Clear search text"
          onClick={handleOnClear}
        >
          ✕
        </button>
      )}
      <button
        className={`search-option-button input-option-button ${snap.caseSensitive ? 'active' : ''}`}
        id="caseSensitiveBtn"
        title="Case sensitive"
        onClick={handleOnSensitiveToggle}
      >
        Aa
      </button>
      <button
        className={`search-options-toggle ${snap.showOptions ? 'active' : ''}`}
        id="optionsToggle"
        onClick={handleOnOptionsToggle}
      >
        ⋮
      </button>
    </div>
  );
};
