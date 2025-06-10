// Add HTML escaping function
export function escapeHTML(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper function to normalize workspace root paths for grouping
// Converts to lowercase, normalizes path separators, and removes trailing slashes for consistent keying.
export function normalizePath(path: string) {
  return path
    .toLowerCase()
    .replace(/\\/g, '/') // Replace backslashes with forward slashes
    .replace(/\/+$/, ''); // Remove trailing slashes
}
