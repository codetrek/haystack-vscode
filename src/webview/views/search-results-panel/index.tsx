import React from 'react';
import { hasResults, StructuredResult } from '../../store/result';
import { WorkspaceGroup, type WorkspaceFileLineClickInfo } from './WorkspaceGroup';
import { useResult } from '../../store/hooks';
import { useMsgPipe } from '../../msgPipe/msgPipe';
import { Summary } from './Summary';

export const SearchResultsPanel: React.FC = () => {
  const { results, errorMessage, status } = useResult();
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

  if (status === 'idle') {
    return <></>;
  }
  if (status === 'loading' && !hasResults()) {
    return <div className="loading-spinner"></div>;
  }
  if (status === 'error') {
    return <div className="error-message">{errorMessage}</div>;
  }

  return (
    <div id="workspace-groups">
      <Summary />
      {Object.entries(results)
        .filter(([, workspace]) => {
          // Only show workspaces that have files with results
          return Object.values(workspace.files).some((file) => file.count > 0);
        })
        .map(([workspacePath, workspace]) => (
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
