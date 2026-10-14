import 'fake-indexeddb/auto';

// vitest setup (vitest.config.ts): browser APIs that jsdom lacks (IndexedDB for the localization cache, matchMedia) and that ported telegram-tt modules read at import.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: undefined,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
