import { useSnapshot } from 'valtio';
import { result, summary } from './result';
import { support } from './support';

export function useResult() {
  return useSnapshot(result);
}

export function useSupport() {
  return useSnapshot(support);
}

export function useSummary() {
  return useSnapshot(summary);
}
