import React from 'react';
import { useSummary } from '../../store/hooks';

export const Summary = () => {
  const { content } = useSummary();
  return content ? (
    <div id="search-summary" className="search-summary">
      {content}
    </div>
  ) : null;
};
