// Original file (not in telegram-tt). Bundles the `media` mock scenario into every build of the mocked client (APP_MOCKED_CLIENT=1):
// the MockClient loads its request middleware and the files of `__data__` by `@vite-ignore` dynamic imports, which a production
// build (the perf gates, `pnpm perf:compare`) leaves out. The replacements are the ones tt-run.mjs applies to the copy of
// telegram-tt (scripts/visual/tt-media-files.mjs), so both apps run the same MockClient code. It never touches a normal build.
import type { Plugin } from 'vite';

import { mediaPatches } from '../scripts/visual/tt-media-files.mjs';

const MOCK_CLIENT_PATH = '/src/lib/gramjs/client/MockClient.ts';

export default function mockClientAssetsPlugin(): Plugin {
  return {
    name: 'telegram-dd:mock-client-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith(MOCK_CLIENT_PATH)) return undefined;

      let result = code;
      for (const patch of mediaPatches) {
        // A patch whose text is gone was fixed natively (the MockClient changed): fail loudly only if it is half applied.
        if (!result.includes(patch.find)) {
          throw new Error(`mock-client-assets: "${patch.name}" does not apply to ${MOCK_CLIENT_PATH}`);
        }
        result = result.replace(patch.find, () => patch.replace);
      }
      // eslint-disable-next-line no-null/no-null -- vite's contract for "no source map"
      return { code: result, map: null };
    },
  };
}
