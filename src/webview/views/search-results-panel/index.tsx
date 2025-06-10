import React from 'react';
import { useSnapshot } from 'valtio';
import { WorkspaceGroup, type WorkspaceFileLineClickInfo } from './WorkspaceGroup';
import {
  hasResults,
  isError,
  isIdle,
  isLoading,
  result,
  StructuredResult,
} from '../../store/result';
import { useMsgPipe } from '../../msgPipe';
import { Summary } from './Summary';

export const SearchResultsPanel: React.FC = () => {
  const { results, errorMessage } = useSnapshot(result);
  const msgPipe = useMsgPipe();
  const handleFileLineClick = React.useCallback(
    ({ workspace, ...rest }: WorkspaceFileLineClickInfo) => {
      msgPipe.post('openFile', {
        ...rest,
        workspaceRoot: workspace,
      });
    },
    [msgPipe],
  );

  if (isIdle()) {
    return <></>;
  }
  if (isLoading() && !hasResults()) {
    return <div className="loading-spinner"></div>;
  }
  if (isError()) {
    return <div className="error-message">{errorMessage}</div>;
  }

  return (
    <div id="workspace-groups">
      <Summary />
      {Object.entries(results).map(([workspacePath, workspace]) => (
        <WorkspaceGroup
          key={workspacePath}
          workspace={workspacePath}
          workspaceName={workspace.workspaceName}
          count={workspace.count}
          files={workspace.files as StructuredResult[string]['files']}
          onFileLineClick={handleFileLineClick}
        />
      ))}
    </div>
  );
};
