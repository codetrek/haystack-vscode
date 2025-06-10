import { useCallback, useRef } from 'react';

export type PossibleRef<T> = React.Ref<T> | undefined;

export type CombinedRef<T> = {
  ref: (instance: T | null) => void;
  readonly current: T | null;
};

// React 19 deprecated forwardRef, so we create a custom hook to combine refs
export function useCombinedRef<T>(externalRef?: PossibleRef<T>): CombinedRef<T> {
  const internalRef = useRef<T>(null);

  const setRef = useCallback(
    (node: T | null) => {
      internalRef.current = node;
      if (externalRef) {
        if (typeof externalRef === 'function') {
          externalRef(node);
        } else if ('current' in externalRef) {
          externalRef.current = node;
        }
      }
    },
    [externalRef],
  );

  return {
    get current() {
      return internalRef.current;
    },
    ref: setRef,
  };
}
