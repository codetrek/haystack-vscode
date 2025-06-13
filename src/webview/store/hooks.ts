import { useSnapshot } from 'valtio';
import { result } from './result';
import { support } from './support';

export function useResult() {
  return useSnapshot(result);
}

export function useSupport() {
  return useSnapshot(support);
}
