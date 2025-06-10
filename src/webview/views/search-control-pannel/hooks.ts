import React, { useCallback, useEffect } from 'react';
import { useSendPipeMsg } from '../../msgPipe';
import { isLoading, setSearchLoading } from '../../store/result';
import { state } from './state';

// This file contains hooks for the search control panel in the webview

export const useSearch = () => {
  const sendPipeMsg = useSendPipeMsg();
  return useCallback(() => {
    if (isLoading()) {
      return;
    }
    if (state.searchTerm.trim() === '') {
      return;
    }
    setSearchLoading();
    const options = {
      caseSensitive: state.caseSensitive,
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
    sendPipeMsg('search', {
      query: state.searchTerm,
      options,
    });
  }, [sendPipeMsg]);
};

export const useCancelSearch = () => {
  const sendPipeMsg = useSendPipeMsg();
  return useCallback(() => {
    if (!isLoading()) {
      return;
    }
    // we should set cancelled state after we receive the searchCancelled message
    // setSearchCancelled();
    sendPipeMsg('cancelSearch');
  }, [sendPipeMsg]);
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
