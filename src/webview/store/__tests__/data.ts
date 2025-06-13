import type { SearchResultStream } from '@/message/webview';

export function getStreamData(truncated = false): SearchResultStream {
  return {
    result: {
      file: 'src/components/UserProfile.tsx',
      lines: [
        {
          before: [
            { line_number: 15, content: "import React from 'react';" },
            { line_number: 16, content: "import { User } from '../types';" },
          ],
          line: {
            line_number: 17,
            content: 'export const UserProfile: React.FC<{ user: User }> = ({ user }) => {',
            match: [44, 48], // the position of "user" in the line
          },
          after: [
            { line_number: 18, content: '  return (' },
            { line_number: 19, content: '    <div className="user-profile">' },
          ],
        },
        {
          before: [{ line_number: 22, content: '      <img src={user.avatar} alt="Avatar" />' }],
          line: {
            line_number: 23,
            content: '      <h2>{user.name}</h2>',
            match: [11, 15], // the position of "user" in the line
          },
          after: [{ line_number: 24, content: '      <p>{user.email}</p>' }],
        },
      ],
    },
    workspaceRoot: '/home/developer/my-react-app',
    workspaceName: 'my-react-app',
    truncated,
    isDone: false,
  } as SearchResultStream;
}
