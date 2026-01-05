// Environment detection and runtime check

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && 
    (window.__TAURI__ !== undefined || window.__TAURI_INTERNALS__ !== undefined);
};

export const isWeb = (): boolean => !isTauri();

export const getEnvironment = (): 'tauri' | 'web' => isTauri() ? 'tauri' : 'web';
