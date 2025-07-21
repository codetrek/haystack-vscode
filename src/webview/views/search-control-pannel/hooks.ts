import React, { useCallback, useEffect } from 'react';
import { useSendPipeMsg } from '../../msgPipe/msgPipe';
import { doSearch, cancelSearch } from '../../msgPipe/sender';
import { state } from './state';

// This file contains hooks for the search control panel in the webview

export const useSearch = () => {
  const sendPipeMsg = useSendPipeMsg();
  return useCallback(
    (noResults = false) => {
      if (state.searchTerm.trim() === '') {
        return;
      }
      const options = {
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        ...(state.showOptions
          ? {
              include: state.includeFiles,
              exclude: state.excludeFiles,
            }
          : {
              include: '',
              exclude: '',
            }),
      };
      doSearch(sendPipeMsg, state.searchTerm, options, noResults);
    },
    [sendPipeMsg],
  );
};

export const useCancelSearch = () => {
  const sendPipeMsg = useSendPipeMsg();
  return useCallback(() => cancelSearch(sendPipeMsg), [sendPipeMsg]);
};

// A hook to manage the focus of the search input
export const useSearchInputFocus = (inputRef: React.RefObject<HTMLInputElement | null>) => {
  const focusSearchInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [inputRef]);

  useEffect(() => {
    // automatically focus the search input when the component mounts
    focusSearchInput();
  }, [focusSearchInput]);

  return focusSearchInput;
};
