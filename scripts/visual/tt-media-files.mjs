// Original file (not in telegram-tt). The `media` mock scenario of the media slices (docs/plans/2026-10-15-media.md §5) is added to
// the COPY of telegram-tt (never to `reference/`) like the `messages` scenario in tt-patches.mjs; it lives in its own module so that
// tt-patches.mjs and tests/visual/screens.ts stay untouched by this branch (merge risk R1 of the plan).
//
//  - `mediaExtraFiles`: the scenario, its request middleware and the generated assets (binary: tt-run copies them as bytes)
//  - `mediaPatches`: the MockClient loads the middleware and the files of `__data__` by `@vite-ignore` dynamic imports, which a
//    PRODUCTION build does not bundle (the perf gates and `pnpm perf:compare` run production builds). These replacements make the
//    `media` scenario (and only it) bundled. They are applied to the tt copy by tt-run.mjs and to our MockClient by
//    plugins/mockClientAssets.ts in every build of the mocked client, so both apps run the same code.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT = 'src/lib/gramjs/client';
const ASSETS = `${CLIENT}/__data__/media`;

const assetFiles = existsSync(join(ROOT, ASSETS))
  ? readdirSync(join(ROOT, ASSETS))
      .filter((name) => !name.startsWith('.'))
      .sort()
      .map((name) => `${ASSETS}/${name}`)
  : [];

export const mediaExtraFiles = [
  `${CLIENT}/__mocks__/media.json`,
  `${CLIENT}/__invokeMiddlewares__/media.ts`,
  ...assetFiles,
];

// Patches of the tt COPY only (the same change is made natively in our tree): see the Deviation in src/util/launchMediaWorkers.ts
export const mediaTtPatches = [
  {
    name: 'requestMediaWorker starts the media workers in test mode',
    file: 'src/util/launchMediaWorkers.ts',
    find: `export default function launchMediaWorkers() {
  if (IS_TEST) return [];`,
    replace: `export default function launchMediaWorkers(isForced = false) {
  if (IS_TEST && !isForced) return [];`,
  },
  {
    name: 'requestMediaWorker forces the media workers',
    file: 'src/util/launchMediaWorkers.ts',
    find: 'return launchMediaWorkers()[index]',
    replace: 'return launchMediaWorkers(true)[index]',
  },
];

export const mediaPatches = [
  {
    name: 'MockClient bundles the media scenario middleware',
    file: `${CLIENT}/MockClient.ts`,
    // eslint-disable-next-line no-template-curly-in-string -- the text of the file to patch
    find: 'const invokeMiddleware = await import(/* @vite-ignore */ `./__invokeMiddlewares__/${scenario}`);',
    replace: `const invokeMiddleware = scenario === 'media'
        ? await import('./__invokeMiddlewares__/media')
        : await import(/* @vite-ignore */ \`./__invokeMiddlewares__/\${scenario}\`);`,
  },
  {
    name: 'MockClient bundles the assets of the media scenario',
    file: `${CLIENT}/MockClient.ts`,
    // eslint-disable-next-line no-template-curly-in-string -- the text of the file to patch
    find: 'await import(/* @vite-ignore */ `./__data__/${l.url}`).then((module) => fetch(module.default))',
    replace: `await (mediaAssets[\`./__data__/\${l.url}\`]?.() ?? import(/* @vite-ignore */ \`./__data__/\${l.url}\`))
            .then((module: any) => fetch(module.default))`,
  },
  {
    name: 'MockClient lists the assets of the media scenario',
    file: `${CLIENT}/MockClient.ts`,
    find: "const sizeTypes: SizeType[] = ['u', 'v', 'w', 'y', 'd', 'x', 'c', 'm', 'b', 'a', 's', 'f'];",
    replace: `const sizeTypes: SizeType[] = ['u', 'v', 'w', 'y', 'd', 'x', 'c', 'm', 'b', 'a', 's', 'f'];
const mediaAssets: Record<string, () => Promise<unknown>> = import.meta.glob('./__data__/media/*', { query: '?url' });`,
  },
  {
    // The downloader (`downloadFile.ts`) awaits `client.getSender(...)`, which is a promise in the real client; the mock returned
    // the sender itself, so `.then` was not a function and no file could be downloaded (the default scenarios never download one).
    name: 'MockClient.getSender returns a promise',
    file: `${CLIENT}/MockClient.ts`,
    find: `  public getSender() {
    return new MockSender(this);
  }`,
    replace: `  public getSender() {
    return Promise.resolve(new MockSender(this));
  }`,
  },
];
