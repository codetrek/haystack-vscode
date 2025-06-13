import React from 'react';
import { useSupport } from '../store/hooks';

export const PlatformWarning: React.FC = () => {
  const { isPlatformSupported } = useSupport();
  return isPlatformSupported ? null : (
    <div className="platform-warning">This platform is not supported.</div>
  );
};
