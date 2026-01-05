import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isTauri, isWeb, getEnvironment } from './environment';

describe('Environment Detection', () => {
  // Store original window properties
  let originalTauri: unknown;
  let originalTauriInternals: unknown;

  beforeAll(() => {
    // Check if running in a browser-like environment before accessing window
    if (typeof window !== 'undefined') {
      originalTauri = window.__TAURI__;
      originalTauriInternals = window.__TAURI_INTERNALS__;
    }
  });

  afterAll(() => {
    // Restore original window properties after all tests
    if (typeof window !== 'undefined') {
      window.__TAURI__ = originalTauri;
      window.__TAURI_INTERNALS__ = originalTauriInternals;
    }
  });

  describe('isTauri', () => {
    it('should return true when window.__TAURI__ is defined', () => {
      if (typeof window !== 'undefined') {
        window.__TAURI__ = {};
        delete window.__TAURI_INTERNALS__;
      }
      expect(isTauri()).toBe(true);
    });

    it('should return true when window.__TAURI_INTERNALS__ is defined', () => {
      if (typeof window !== 'undefined') {
        delete window.__TAURI__;
        window.__TAURI_INTERNALS__ = {};
      }
      expect(isTauri()).toBe(true);
    });

    it('should return false when neither Tauri property is defined', () => {
      if (typeof window !== 'undefined') {
        delete window.__TAURI__;
        delete window.__TAURI_INTERNALS__;
      }
      expect(isTauri()).toBe(false);
    });
  });

  describe('isWeb', () => {
    it('should return false when in Tauri environment', () => {
      if (typeof window !== 'undefined') {
        window.__TAURI__ = {};
      }
      expect(isWeb()).toBe(false);
    });

    it('should return true when not in Tauri environment', () => {
      if (typeof window !== 'undefined') {
        delete window.__TAURI__;
        delete window.__TAURI_INTERNALS__;
      }
      expect(isWeb()).toBe(true);
    });
  });

  describe('getEnvironment', () => {
    it('should return "tauri" when in Tauri environment', () => {
      if (typeof window !== 'undefined') {
        window.__TAURI_INTERNALS__ = {};
      }
      expect(getEnvironment()).toBe('tauri');
    });

    it('should return "web" when not in Tauri environment', () => {
      if (typeof window !== 'undefined') {
        delete window.__TAURI__;
        delete window.__TAURI_INTERNALS__;
      }
      expect(getEnvironment()).toBe('web');
    });
  });
});
