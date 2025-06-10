import { proxy } from 'valtio';

export const state = proxy({
  searchTerm: '',
  includeFiles: '',
  excludeFiles: '',
  caseSensitive: false,
  showOptions: false,
});
