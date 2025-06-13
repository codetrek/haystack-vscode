import React from 'react';
import { hasResults, isError, isIdle, isLoading, StructuredResult } from '../../store/result';
import { WorkspaceGroup, type WorkspaceFileLineClickInfo } from './WorkspaceGroup';
import { useResult } from '../../store/hooks';
import { useMsgPipe } from '../../msgPipe/msgPipe';
import { Summary } from './Summary';

export const SearchResultsPanel: React.FC = () => {
  const { results, errorMessage } = useResult();
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
