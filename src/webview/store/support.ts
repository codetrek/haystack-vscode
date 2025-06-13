import { proxy } from 'valtio';

export const support = proxy({
  isPlatformSupported: true,
});

export function setPlatformSupport(supported: boolean) {
  support.isPlatformSupported = supported;
}

export function getIsPlatformSupported() {
  return support.isPlatformSupported;
}
