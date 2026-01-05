// vitest.setup.ts
import '@testing-library/jest-dom';

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as any;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock DOMMatrix for PDF.js
class DOMMatrixMock {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor() {}
  multiply() { return new DOMMatrixMock(); }
  inverse() { return new DOMMatrixMock(); }
  translate() { return new DOMMatrixMock(); }
  scale() { return new DOMMatrixMock(); }
  rotate() { return new DOMMatrixMock(); }
  transformPoint() { return { x: 0, y: 0 }; }
}
global.DOMMatrix = DOMMatrixMock as any;
