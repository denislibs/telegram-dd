import { createEffect, createSignal, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import cycleRestrict from '../util/cycleRestrict';
import { depsOf } from '../util/effectDeps';
import { preloadImage } from '../util/files';
import { MAX_WORKERS, requestMediaWorker } from '../util/launchMediaWorkers';

const RADIUS_RATIO = 0.1; // Use 10% of the smallest dimension as the blur radius

let lastWorkerIndex = -1;

// Deviation: the parameters are `MaybeAccessor`s and the hook returns a callback ref for the canvas (tt returned a ref
// object): the element is kept in a signal, so a canvas that is created later than the hook (a conditional element) is
// blurred as soon as it exists, and a new element starts over (a canvas can be transferred to the worker once).
export default function useOffscreenCanvasBlur(
  thumbData: MaybeAccessor<string | undefined>, // data URI or blob URL
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) {
  const [canvasEl, setCanvasEl] = createSignal<HTMLCanvasElement | undefined>(undefined);
  const workerIndex = cycleRestrict(MAX_WORKERS, ++lastWorkerIndex);
  // The canvas that was handed (or is being handed) to the worker: tt's `offscreenRef`.
  let startedCanvas: HTMLCanvasElement | undefined;

  const blurThumb = async (canvas: HTMLCanvasElement, uri: string) => {
    // Deviation (untrusted): `preloadImage` rejects for an undecodable thumbnail; tt left that as an unhandled rejection.
    const image = await preloadImage(uri).catch(() => undefined);
    if (!image) {
      startedCanvas = undefined;
      return;
    }

    requestMutation(() => {
      canvas.width = image.width;
      canvas.height = image.height;

      const offscreen = canvas.transferControlToOffscreen();

      const radius = Math.ceil(Math.min(image.width, image.height) * RADIUS_RATIO);

      requestMediaWorker(
        {
          name: 'offscreen-canvas:blurThumb',
          args: [offscreen, uri, radius],
          transferables: [offscreen],
        },
        workerIndex,
      );
    });
  };

  createEffect(
    depsOf(() => [canvasEl(), read(thumbData), read(isDisabled)] as const),
    ([canvas, thumbData2, isDisabled2]) => {
      if (!thumbData2 || isDisabled2 || !canvas || startedCanvas === canvas) return;

      startedCanvas = canvas;
      void blurThumb(canvas, thumbData2);
    },
  );

  return (el: HTMLCanvasElement) => {
    setCanvasEl(el);
  };
}
