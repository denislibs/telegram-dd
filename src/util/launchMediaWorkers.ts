import type { MediaWorkerApi } from '../lib/mediaWorker/index.worker';
import type { Connector } from './PostMessageConnector';

import { IS_TEST } from '../config';

import { createConnector } from './PostMessageConnector';

export const MAX_WORKERS = Math.min(navigator.hardwareConcurrency || 4, 4);

let instances: {
  worker: Worker;
  connector: Connector<MediaWorkerApi>;
}[] | undefined;

// Deviation: `requestMediaWorker` (the thumbnail blur, the appendix colour, image resizing) starts the workers under APP_ENV=test
// too (`isForced`): tt returned none there and its first request threw, so under the mocked client no thumbnail was ever blurred and
// every media message logged an error. `launchMediaWorkers()` itself still returns none in test mode (TLottie depends on that).
export default function launchMediaWorkers(isForced = false) {
  if (IS_TEST && !isForced) return [];
  if (!instances) {
    instances = new Array(MAX_WORKERS).fill(undefined).map(
      () => {
        const worker = new Worker(new URL('../lib/mediaWorker/index.worker.ts', import.meta.url), { type: 'module' });
        const connector = createConnector<MediaWorkerApi>(worker, undefined, 'media');
        return { worker, connector };
      },
    );
  }

  return instances;
}

export function requestMediaWorker(payload: Parameters<Connector<MediaWorkerApi>['request']>[0], index: number) {
  return launchMediaWorkers(true)[index].connector.request(payload);
}
