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

// Throttle function to limit function calls with flush capability
export function throttle<T>(func: (data: T[]) => void, delay: number) {
  let lastExec = 0;
  let timeout: NodeJS.Timeout | null = null;
  let buffer: T[] = [];

  const throttled = function (data: T) {
    buffer.push(data);
    const now = Date.now();
    const remaining = delay - (now - lastExec);

    if (remaining <= 0 || remaining > delay) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastExec = now;
      const currentBuffer = [...buffer];
      buffer = [];
      func(currentBuffer);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastExec = Date.now();
        timeout = null;
        const currentBuffer = [...buffer];
        buffer = [];
        func(currentBuffer);
      }, remaining);
    }
  };

  // Add a flush method to process any remaining items
  throttled.flush = function () {
    if (buffer.length > 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      const currentBuffer = [...buffer];
      buffer = [];
      func(currentBuffer);
    }
  };

  return throttled;
}
