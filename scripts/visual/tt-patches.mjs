// Patches applied to the COPY of telegram-tt in .cache/tt-run (never to `reference/`). Each patch is an exact-string
// replacement and fails loudly when the reference moves and the text is gone, so the list stays honest.
//
// Keep it short: tt's mocked mode is already deterministic enough for screenshots (the runner freezes the clock,
// seeds Math.random, disables animations and fixes locale / timezone / viewport from the browser side).
//
// Shape: { name, file, find, replace }
export const patches = [
  {
    // At the baseline commit MockClient.start() ignores its `onConnected` callback (the real TelegramClient.start()
    // calls it, src/lib/gramjs/client/TelegramClient.ts). The worker's initApi() promise is therefore never resolved,
    // `isInited` stays false in the main thread, every callApi() is queued forever and the chat list shows a spinner.
    name: 'MockClient.start calls onConnected',
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
];
