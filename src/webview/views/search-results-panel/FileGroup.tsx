import React from 'react';
import type { StructuredResult } from '../../store/result';
import { MatchLine, type LineClickInfo } from './MatchLine';

export interface FileLineClickInfo extends LineClickInfo {
  file: string;
}

export interface FileGroupProps {
  filePath: string;
  count: number;
  truncated: boolean;
  matches: StructuredResult[string]['files'][string]['results'];
  onFileLineClick: (info: FileLineClickInfo) => void;
}

export const FileGroup: React.FC<FileGroupProps> = ({
  matches,
  filePath,
  count,
  truncated,
  onFileLineClick,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  function handleLineClick(info: { start: number; end: number; line: number }) {
    onFileLineClick({ ...info, file: filePath });
  }

  return (
    <div key={filePath} className="file-group">
      <div
        className={`file-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span
          className={`toggle-icon codicon ${
            collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'
          }`}
        ></span>

        <span className="file-path" title={filePath}>
          {filePath}
          {truncated ? ' (truncated)' : ''}
        </span>

        <span className="match-count">{count}</span>
      </div>

      <div className={`file-results ${collapsed ? 'collapsed' : ''}`}>
        {matches.map((match, index) => (
          <MatchLine
            key={`${filePath}:${match.line.line_number}:${index}`}
            match={match}
            onLineClick={handleLineClick}
          />
        ))}
      </div>
    </div>
  );
};
