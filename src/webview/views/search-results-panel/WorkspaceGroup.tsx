import React from 'react';
import { FileGroup, type FileLineClickInfo } from './FileGroup';
import type { StructuredResult } from '../../store/result';

export interface WorkspaceFileLineClickInfo extends FileLineClickInfo {
  workspace: string;
}

export interface WorkspaceGroupProps {
  workspace: string;
  workspaceName: string;
  count: number;
  files: StructuredResult[string]['files'];
  onFileLineClick: (info: WorkspaceFileLineClickInfo) => void;
}

export const WorkspaceGroup: React.FC<WorkspaceGroupProps> = ({
  workspace,
  workspaceName,
  count,
  files,
  onFileLineClick,
}) => {
  // default isCollapsed to false
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const handleFileLineClick = React.useCallback(
    (info: FileLineClickInfo) => {
      onFileLineClick({ ...info, workspace });
    },
    [onFileLineClick, workspace],
  );

  return (
    <div className="workspace-group">
      <div
        className={`workspace-header ${isCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="workspace-header-left">
          <span
            className={`toggle-icon codicon ${
              isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'
            }`}
          ></span>
          <span className="workspace-name" title={workspaceName}>
            {workspaceName}
          </span>
        </div>
        <span className="workspace-match-count">{count}</span>
      </div>
      <div className={`workspace-results ${isCollapsed ? 'collapsed' : ''}`}>
        {Object.entries(files).map(([filePath, fileData]) => (
          <FileGroup
            key={filePath}
            filePath={filePath}
            count={fileData.count}
            matches={fileData.results}
            truncated={fileData.truncated || false}
            onFileLineClick={handleFileLineClick}
          />
        ))}
      </div>
    </div>
  );
};
