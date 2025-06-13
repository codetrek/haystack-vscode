import React from 'react';
import { useResult } from '../../store/hooks';

export const Summary = () => {
  const { searchSummary } = useResult();
  return searchSummary ? (
    <div id="search-summary" className="search-summary">
      {searchSummary}
    </div>
  ) : null;
};
