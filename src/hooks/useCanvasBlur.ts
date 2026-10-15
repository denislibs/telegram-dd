import { createEffect, requestMeasure, requestMutation } from 'frameact';
import { depsOf } from '../util/effectDeps';

import fastBlur from '../lib/fastBlur';
import { IS_CANVAS_FILTER_SUPPORTED } from '../util/browser/windowEnvironment';
import useSyncEffect from './useSyncEffect';

const RADIUS = 2;
const ITERATIONS = 2;

// TODO(codemod): useCanvasBlur: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useCanvasBlur(
  dataUri?: string,
  isDisabled = false,
  withRaf?: boolean,
  radius = RADIUS,
  preferredWidth?: number,
  preferredHeight?: number,
) {
  let canvasRef!: HTMLCanvasElement;
  let isStartedRef;

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(depsOf(() => [dataUri, isDisabled]), () => {
    if (!isDisabled) {
      isStartedRef = false;
    }
  });

  createEffect(depsOf(() => [dataUri, isDisabled, preferredHeight, preferredWidth, radius, withRaf]), () => {
    const canvas = canvasRef;

    if (!dataUri || !canvas || isDisabled || isStartedRef) {
      return;
    }

    isStartedRef = true;

    const img = new Image();

    const processBlur = () => {
      const width = preferredWidth || img.width;
      const height = preferredHeight || img.height;
      const ctx = canvas.getContext('2d', { alpha: false })!;

      requestMutation(() => {
        canvas.width = width;
        canvas.height = height;

        if (IS_CANVAS_FILTER_SUPPORTED) {
          ctx.filter = `blur(${radius}px)`;
        }

        ctx.drawImage(img, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);

        if (!IS_CANVAS_FILTER_SUPPORTED) {
          fastBlur(ctx, 0, 0, width, height, radius, ITERATIONS);
        }
      });
    };

    img.onload = () => {
      if (withRaf) {
        requestMeasure(processBlur);
      } else {
        processBlur();
      }
    };

    img.src = dataUri;
  });

  // TODO(codemod): "canvasRef" was a ref object passed as a value: pass an accessor (() => canvasRef) or a callback ref
  return canvasRef;
}
