import React from 'react';
import type { LineMatch } from '@/types/search';

export interface LineClickInfo {
  start: number;
  end: number;
  line: number;
}

export interface MatchLineProps {
  match: LineMatch;
  onLineClick: (info: LineClickInfo) => void;
}

export const MatchLine: React.FC<MatchLineProps> = ({ match, onLineClick }) => {
  const [start, end] = React.useMemo(() => {
    const matchPositions = match.line.match || [];
    if (matchPositions.length >= 2) {
      return [matchPositions[0], matchPositions[1]];
    }
    return [0, 0];
  }, [match]);

  const [beforeContent, highlightedContent, afterContent] = React.useMemo(() => {
    let beforeContent = '';
    let afterContent = '';
    let highlightedContent = '';
    const { content } = match.line;
    const matchPositions = match.line.match || [];
    if (matchPositions.length >= 2) {
      const beforeMatch = content.substring(0, start);
      beforeContent =
        beforeMatch.length > 12
          ? '...' + beforeMatch.substring(beforeMatch.length - 12)
          : beforeMatch;

      highlightedContent = content.substring(start, end);

      const afterMatch = content.substring(end);
      afterContent = afterMatch.length > 128 ? afterMatch.substring(0, 128) + '...' : afterMatch;
    } else {
      beforeContent = content.length > 160 ? content.substring(0, 160) + '...' : content;
    }
    return [beforeContent, highlightedContent, afterContent];
  }, [match, start, end]);

  const line = match.line.line_number;

  return (
    <div className="result-item" onClick={() => onLineClick({ start, end, line })}>
      {/* <span className="line-number">{line}</span> */}
      <span className="line-content">
        {beforeContent}
        {highlightedContent && <span className="match-highlight">{highlightedContent}</span>}
        {afterContent}
      </span>
    </div>
  );
};
