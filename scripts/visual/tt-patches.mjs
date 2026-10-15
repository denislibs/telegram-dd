// Patches applied to the COPY of telegram-tt in .cache/tt-run (never to `reference/`). Each patch is an exact-string
// replacement and fails loudly when the reference moves and the text is gone, so the list stays honest.
//
// Keep it short: tt's mocked mode is already deterministic enough for screenshots (the runner freezes the clock,
// seeds Math.random, disables animations and fixes locale / timezone / viewport from the browser side).
//
// Shape: { name, file, find, replace, shared? }
// `shared: true` marks a fix of the MOCK itself (MockClient is a verbatim port in our app, so it has the same defect):
// the perf comparison (tests/perfcmp) applies those to our tree too, for the duration of its build only, and skips
// one whose text is already gone (fixed natively). The rest are tt-only hooks.
export const patches = [
  {
    // At the baseline commit MockClient.start() ignores its `onConnected` callback (the real TelegramClient.start()
    // calls it, src/lib/gramjs/client/TelegramClient.ts). The worker's initApi() promise is therefore never resolved,
    // `isInited` stays false in the main thread, every callApi() is queued forever and the chat list shows a spinner.
    name: 'MockClient.start calls onConnected',
    shared: true,
    file: 'src/lib/gramjs/client/MockClient.ts',
    find: `  start({
    mockScenario,
  }: {
    mockScenario: string;
  }) {
    return this.loadScenario(mockScenario);
  }`,
    replace: `  async start({
    mockScenario,
  }: {
    mockScenario: string;
  }, onConnected?: () => void) {
    await this.loadScenario(mockScenario);
    onConnected?.();
  }`,
  },
  {
    // The perf comparison (tests/perfcmp) runs a PRODUCTION build (DEBUG off) and injects `apiUpdate`s through
    // `window.getActions()`, like the visual gate does in dev. tt exposes these handles only when DEBUG is on, which
    // would also turn on tt's debug paths (a copied global per getGlobal(), update counters) and skew the timing.
    // Mocked-client builds expose them in production too; our app has the same line in src/global/index.ts.
    name: 'expose getGlobal/getActions in mocked builds',
    file: 'src/lib/teact/teactn.tsx',
    find: `if (DEBUG) {
  (window as any).getGlobal = getUntypedGlobal;`,
    replace: `if (DEBUG || import.meta.env.TG_APP_MOCKED_CLIENT === '1') {
  (window as any).getGlobal = getUntypedGlobal;`,
  },
  {
    // The real GetDialogFilters returns `messages.DialogFilters { filters, tagsEnabled }`; the mock still returns the
    // bare array, so fetchChatFolders() throws ("reading 'findIndex'") and the folder tabs never appear.
    name: 'MockClient GetDialogFilters returns messages.DialogFilters',
    shared: true,
    file: 'src/lib/gramjs/client/MockClient.ts',
    find: `      return [
        new Api.DialogFilterDefault(),
        ...this.mockData.dialogFilters
          .map((dialogFilter) => createMockedDialogFilter(dialogFilter.id, this.mockData)),
      ];`,
    replace: `      return new Api.messages.DialogFilters({
        filters: [
          new Api.DialogFilterDefault(),
          ...this.mockData.dialogFilters
            .map((dialogFilter) => createMockedDialogFilter(dialogFilter.id, this.mockData)),
        ],
      });`,
  },
];

// Files of OUR tree that are added to the COPY of telegram-tt (never to `reference/`): the committed mock scenarios of the
// middle column gates and the request handler that pages their history. They only use MockClient modules that exist at the
// same paths in tt, so both apps serve the same data (`tests/visual/mocks.spec.ts` compares them).
export const extraFiles = [
  'src/lib/gramjs/client/__mocks__/messages.json',
  'src/lib/gramjs/client/__invokeMiddlewares__/messages.ts',
];
