import React from 'react';
import { useSnapshot } from 'valtio';
import { result } from '../../store/result';

export const Summary = () => {
  const { searchSummary } = useSnapshot(result);
  return searchSummary ? (
    <div id="search-summary" className="search-summary">
      {searchSummary}
    </div>
  ) : null;
};
