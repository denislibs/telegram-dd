import { createMutationEffect, requestMutation } from 'frameact';
import { depsOf } from '../util/effectDeps';

import cycleRestrict from '../util/cycleRestrict';
import { preloadImage } from '../util/files';
import { MAX_WORKERS, requestMediaWorker } from '../util/launchMediaWorkers';
import useLastCallback from './useLastCallback';

const RADIUS_RATIO = 0.1; // Use 10% of the smallest dimension as the blur radius

let lastWorkerIndex = -1;

// TODO(codemod): useOffscreenCanvasBlur: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useOffscreenCanvasBlur(
  thumbData?: string, // data URI or blob URL
  isDisabled = false,
) {
  let canvasRef!: HTMLCanvasElement;
  const workerIndex = cycleRestrict(MAX_WORKERS, ++lastWorkerIndex);
  let offscreenRef: OffscreenCanvas | undefined;

  const blurThumb = async (canvas: HTMLCanvasElement, uri: string) => {
    const image = await preloadImage(uri);
    if (!image) {
      return;
    }

    requestMutation(() => {
      canvas.width = image.width;
      canvas.height = image.height;

      offscreenRef = canvas.transferControlToOffscreen();

      const radius = Math.ceil(Math.min(image.width, image.height) * RADIUS_RATIO);

      requestMediaWorker(
        {
          name: 'offscreen-canvas:blurThumb',
          args: [offscreenRef, uri, radius],
          transferables: [offscreenRef],
        },
        workerIndex,
      );
    });
  };

  createMutationEffect(depsOf(() => [blurThumb, isDisabled, thumbData]), () => {
    if (!thumbData || isDisabled || offscreenRef) return;

    const canvas = canvasRef;
    if (!canvas) return;

    blurThumb(canvas, thumbData);
  });

  // TODO(codemod): "canvasRef" was a ref object passed as a value: pass an accessor (() => canvasRef) or a callback ref
  return canvasRef;
}
