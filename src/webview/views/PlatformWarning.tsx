import React from 'react';
import { support } from '../store/support';
import { useSnapshot } from 'valtio';

export const PlatformWarning: React.FC = () => {
  const snap = useSnapshot(support);
  return snap.isPlatformSupported ? null : (
    <div className="platform-warning">This platform is not supported.</div>
  );
};
