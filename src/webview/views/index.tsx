import React, { useEffect } from 'react';
import { PlatformWarning } from './PlatformWarning';
import { MsgPipeProvider, useMsgPipe } from '../msgPipe/msgPipe';
import { SearchResultsPanel } from './search-results-panel';
import { SearchControlPanel } from './search-control-pannel/index';
import './style.css';

const AppContent: React.FC = () => {
  const msgPipe = useMsgPipe();

  useEffect(() => {
    // notify extension that the webview's DOM is loaded
    msgPipe.post('domLoaded');
  }, [msgPipe]);
  return (
    <div className="search-container">
      <PlatformWarning />
      <SearchControlPanel />
      <SearchResultsPanel />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <MsgPipeProvider>
      <AppContent />
    </MsgPipeProvider>
  );
};
