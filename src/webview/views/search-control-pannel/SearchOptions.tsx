import React from 'react';
import { useSnapshot } from 'valtio';
import { state } from './state';

export const SearchOptions: React.FC = () => {
  const snap = useSnapshot(state);
  return (
    <div className={`search-options ${snap.showOptions ? 'visible' : ''}`} id="searchOptions">
      <div className="search-option">
        <input
          type="text"
          className="search-input"
          id="includeFiles"
          value={snap.includeFiles}
          onChange={(e) => (state.includeFiles = e.target.value)}
          placeholder="Files to include (e.g. *.ts,core/*)"
        />
      </div>
      <div className="search-option">
        <input
          type="text"
          className="search-input"
          id="excludeFiles"
          value={snap.excludeFiles}
          onChange={(e) => (state.excludeFiles = e.target.value)}
          placeholder="Files to exclude"
        />
      </div>
    </div>
  );
};
