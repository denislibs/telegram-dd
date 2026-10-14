// frameact's `env.ts` reads `process.env.NODE_ENV`; app code is typed without @types/node (as in telegram-tt, where
// `setTimeout` must stay `number`), so declare just that much. Not part of tsconfig.script.json (which has node types).
declare const process: { env: Record<string, string | undefined> };
